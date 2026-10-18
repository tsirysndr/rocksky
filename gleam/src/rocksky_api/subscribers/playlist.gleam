import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/agent as atproto
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, eq, eq_columns, field, from, inner_join, one, select, where,
}
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as p
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lexicon/validation
import rocksky_api/lib/agent
import rocksky_api/lib/helpers
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/node/tid
import rocksky_api/playlists/service
import rocksky_api/task
import rocksky_api/typesense/search

pub type ImportedSong {
  ImportedSong(
    uri: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    duration: Int,
    album_art_url: Option(String),
  )
}

pub type PlaylistImport {
  PlaylistImport(
    did: String,
    name: String,
    description: Option(String),
    picture_url: Option(String),
    spotify_link: Option(String),
    songs: List(ImportedSong),
  )
}

fn opt(key, decoder, next) {
  decode.optional_field(key, None, decode.optional(decoder), next)
}

pub fn decoder() {
  use did <- decode.field("did", decode.string)
  use name <- decode.field("name", decode.string)
  use description <- opt("description", decode.string)
  use picture <- opt("pictureUrl", decode.string)
  use spotify <- opt("spotifyLink", decode.string)
  use songs <- decode.field(
    "songs",
    decode.list({
      use uri <- decode.field("uri", decode.string)
      use title <- decode.field("title", decode.string)
      use artist <- decode.field("artist", decode.string)
      use album <- decode.field("album", decode.string)
      use album_artist <- decode.field("albumArtist", decode.string)
      use duration <- decode.field("duration", decode.int)
      use art <- opt("albumArtUrl", decode.string)
      decode.success(ImportedSong(
        uri,
        title,
        artist,
        album,
        album_artist,
        duration,
        art,
      ))
    }),
  )
  decode.success(PlaylistImport(did, name, description, picture, spotify, songs))
}

fn optional(key, value) {
  case helpers.non_empty(value) {
    None -> []
    Some(v) -> [#(key, json.string(v))]
  }
}

fn now() {
  row.iso8601(row.from_unix_ms(js.now_ms()))
}

fn valid(collection, record) {
  validation.record(collection, record)
  |> result.map_error(fn(_) { error.InvalidRequest("Invalid playlist record") })
  |> task.from_result
}

pub fn existing_song_uris(ctx: Context, uri: String) {
  let entries = pt.table()
  let playlists = p.table()
  let tracks = t.table()
  select(entries, field("uri", t.uri(tracks)))
  |> inner_join(playlists, eq_columns(pt.playlist_id(entries), p.id(playlists)))
  |> inner_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
  |> where(eq(p.uri(playlists), Some(uri)))
  |> all(ctx.db)
  |> task.map(fn(rows) {
    list.filter_map(rows, fn(r) { option.to_result(r, Nil) })
  })
}

pub fn publish_playlist(
  ctx: Context,
  payload: PlaylistImport,
  factory: fn(String) -> task.Task(Option(atproto.Agent)),
) {
  use agent <- task.then(factory(payload.did))
  case agent {
    None -> task.ok(Nil)
    Some(agent) -> {
      let playlists = p.table()
      use existing <- task.then(case helpers.non_empty(payload.spotify_link) {
        None -> task.ok(None)
        Some(link) ->
          from(playlists)
          |> where(eq(p.spotify_link(playlists), Some(link)))
          |> one(ctx.db)
      })
      let rkey = case option.then(existing, fn(p) { p.uri }) {
        Some(uri) if uri != "" -> atproto.rkey_of(uri)
        _ -> tid.next()
      }
      let created = case existing {
        Some(p) -> row.iso8601(p.created_at)
        None -> now()
      }
      let record =
        json.object(
          list.flatten([
            [
              #("$type", json.string(service.playlist_collection)),
              #("name", json.string(payload.name)),
              #("createdAt", json.string(created)),
            ],
            optional("description", payload.description),
            optional("pictureUrl", payload.picture_url),
            optional("spotifyLink", payload.spotify_link),
          ]),
        )
      use _ <- task.then(valid(service.playlist_collection, record))
      use repo <- task.then(
        task.require(atproto.did(agent), "Missing agent DID")
        |> task.from_result,
      )
      use playlist <- task.then(
        atproto.put_record_unchecked(
          agent,
          repo,
          service.playlist_collection,
          rkey,
          record,
          None,
        )
        |> task.attempt_result,
      )
      use existing <- task.then(existing_song_uris(ctx, playlist.uri))
      task.each_(payload.songs, fn(song) {
        case list.contains(existing, song.uri) {
          True -> task.ok(Nil)
          False ->
            publish_song(ctx, agent, repo, song, playlist)
            |> task.rescue(fn(e) {
              log.error(
                "Failed to add " <> song.title <> ": " <> error.describe(e),
              )
              task.ok(Nil)
            })
        }
      })
    }
  }
}

fn publish_song(
  ctx: Context,
  agent: atproto.Agent,
  repo: String,
  song: ImportedSong,
  playlist: atproto.RecordRef,
) {
  use song_ref <- task.then(service.record_ref(
    ctx,
    song.uri,
    "app.rocksky.song",
  ))
  let playlist_ref =
    models.encode_strong_ref(models.StrongRef(playlist.uri, playlist.cid))
  use _ <- task.then(valid("com.atproto.repo.strongRef", playlist_ref))
  let record =
    json.object(list.append(
      [
        #("$type", json.string(service.playlist_song_collection)),
        #("playlist", playlist_ref),
        #("song", models.encode_strong_ref(song_ref)),
        #("title", json.string(song.title)),
        #("artist", json.string(song.artist)),
        #("album", json.string(song.album)),
        #("albumArtist", json.string(song.album_artist)),
        #("duration", json.int(song.duration)),
        #("addedAt", json.string(now())),
      ],
      optional("albumArtUrl", song.album_art_url),
    ))
  use _ <- task.then(valid(service.playlist_song_collection, record))
  atproto.create_record_unchecked(
    agent,
    repo,
    service.playlist_song_collection,
    tid.next(),
    record,
  )
  |> task.attempt_result
  |> task.map(fn(_) { Nil })
}

pub fn indexed(ctx: Context, id: String) {
  let playlists = p.table()
  use row <- task.then(
    from(playlists) |> where(eq(p.id(playlists), id)) |> one(ctx.db),
  )
  case row {
    None -> task.ok(Nil)
    Some(p) -> search.index_playlists(ctx.typesense, [p])
  }
}

pub fn start(ctx: Context) {
  let imported =
    nats.subscribe(ctx.nc, "rocksky.playlist.import", fn(payload) {
      let work = {
        use raw <- task.then(
          js.parse_json(payload)
          |> result.map_error(error.Js)
          |> task.from_result,
        )
        use payload <- task.then(
          decode.run(raw, decoder())
          |> result.map_error(error.Decode("playlist.import", _))
          |> task.from_result,
        )
        publish_playlist(ctx, payload, agent.create(ctx, _))
      }
      task.unwrap_or(work, fn(e) {
        log.error("rocksky.playlist.import: " <> error.describe(e))
      })
    })
  let indexed =
    nats.subscribe(ctx.nc, "rocksky.playlist.indexed", fn(id) {
      indexed(ctx, id)
      |> task.unwrap_or(fn(e) {
        log.warn("[typesense] playlist index failed: " <> error.describe(e))
      })
    })
  #(imported, indexed)
}
