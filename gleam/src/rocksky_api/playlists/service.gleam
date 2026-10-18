import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, asc, eq, eq_columns, field, from, inner_join, one, order_by, pair, select,
  where,
}
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as p
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lexicon/validation
import rocksky_api/lib/extract_pds
import rocksky_api/node/js
import rocksky_api/node/tid
import rocksky_api/task

pub const playlist_collection = "app.rocksky.playlist"

pub const playlist_song_collection = "app.rocksky.playlist.song"

pub fn at_uri_repo(uri: String) {
  let uri = case string.starts_with(uri, "at://") {
    True -> string.drop_start(uri, 5)
    False -> uri
  }
  case string.split(uri, "/") {
    [repo, ..] if repo != "" -> Ok(repo)
    _ -> Error(error.RequestError("InvalidUri", "Not an AT-URI: " <> uri))
  }
}

fn owner(uri: String, did: String) {
  use repo <- result.try(at_uri_repo(uri))
  case repo == did {
    True -> Ok(Nil)
    False ->
      Error(error.RequestError(
        "Forbidden",
        "Only the playlist owner can modify it",
      ))
  }
}

fn did(agent: agent.Agent) {
  task.require(agent.did(agent), "Missing agent DID") |> task.from_result
}

fn now() {
  row.iso8601(row.from_unix_ms(js.now_ms()))
}

fn optional(key: String, value: Option(String)) {
  case value {
    Some(v) -> [#(key, json.string(v))]
    None -> []
  }
}

fn nonempty(value: Option(String)) {
  case value {
    Some("") -> None
    _ -> value
  }
}

fn valid(collection: String, record: json.Json) {
  validation.record(collection, record)
  |> result.map_error(fn(_) {
    error.RequestError("InvalidRecord", "Invalid playlist record")
  })
  |> task.from_result
}

pub fn record_ref(ctx: Context, uri: String, collection: String) {
  use repo <- task.then(task.from_result(at_uri_repo(uri)))
  use pds <- task.then(extract_pds.from_did(ctx.env.plc_directory_url, repo))
  use record <- task.then(
    task.attempt_result(agent.get_record(
      agent.atp_agent(pds),
      repo,
      collection,
      agent.rkey_of(uri),
    )),
  )
  use cid <- task.then(
    task.from_result(task.require(record.cid, "Missing record CID")),
  )
  let ref = models.StrongRef(uri, cid)
  use _ <- task.map(
    validation.record(
      "com.atproto.repo.strongRef",
      models.encode_strong_ref(ref),
    )
    |> result.map_error(fn(_) {
      error.RequestError("InvalidRef", "Invalid ref for " <> uri)
    })
    |> task.from_result,
  )
  ref
}

pub fn create(
  agent: agent.Agent,
  name: String,
  description: Option(String),
  picture: Option(String),
) {
  let record =
    json.object([
      #("$type", json.string(playlist_collection)),
      #("name", json.string(name)),
      #("createdAt", json.string(now())),
      ..list.append(
        optional("description", nonempty(description)),
        optional("pictureUrl", nonempty(picture)),
      )
    ])
  use _ <- task.then(valid(playlist_collection, record))
  use repo <- task.then(did(agent))
  task.attempt_result(agent.create_record_unchecked(
    agent,
    repo,
    playlist_collection,
    tid.next(),
    record,
  ))
}

pub fn update(
  agent: agent.Agent,
  user_did: String,
  uri: String,
  name: Option(String),
  description: Option(String),
  picture: Option(String),
) {
  use _ <- task.then(task.from_result(owner(uri, user_did)))
  use repo <- task.then(did(agent))
  use existing <- task.then(
    task.attempt_result(agent.get_record(
      agent,
      repo,
      playlist_collection,
      agent.rkey_of(uri),
    )),
  )
  let changes = [
    #("$type", json.string(playlist_collection)),
    ..list.flatten([
      optional("name", name),
      optional("description", description),
      optional("pictureUrl", picture),
    ])
  ]
  let keys = list.map(changes, fn(p) { p.0 })
  let kept =
    js.entries(existing.value)
    |> list.filter(fn(p) { !list.contains(keys, p.0) })
    |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
  let record = json.object(list.append(kept, changes))
  use _ <- task.then(valid(playlist_collection, record))
  task.attempt_result(agent.put_record_unchecked(
    agent,
    repo,
    playlist_collection,
    agent.rkey_of(uri),
    record,
    None,
  ))
}

pub fn add_songs(
  ctx: Context,
  agent: agent.Agent,
  user_did: String,
  uri: String,
  songs: List(String),
) {
  use _ <- task.then(task.from_result(owner(uri, user_did)))
  use playlist <- task.then(record_ref(ctx, uri, playlist_collection))
  use repo <- task.then(did(agent))
  use uri <- task.each(songs)
  let tracks = t.table()
  use song <- task.then(
    from(tracks)
    |> where(eq(t.uri(tracks), Some(uri)))
    |> one(ctx.db)
    |> task.try_map(fn(s) {
      option.to_result(
        s,
        error.RequestError("NotFound", "Song not found: " <> uri),
      )
    }),
  )
  use ref <- task.then(record_ref(ctx, uri, "app.rocksky.song"))
  let record =
    json.object([
      #("$type", json.string(playlist_song_collection)),
      #("playlist", models.encode_strong_ref(playlist)),
      #("song", models.encode_strong_ref(ref)),
      #("title", json.string(song.title)),
      #("artist", json.string(song.artist)),
      #("album", json.string(song.album)),
      #("albumArtist", json.string(song.album_artist)),
      #("duration", json.int(song.duration)),
      #("addedAt", json.string(now())),
      ..optional("albumArtUrl", nonempty(song.album_art))
    ])
  use _ <- task.then(valid(playlist_song_collection, record))
  use created <- task.map(
    task.attempt_result(agent.create_record_unchecked(
      agent,
      repo,
      playlist_song_collection,
      tid.next(),
      record,
    )),
  )
  created.uri
}

fn own(uris: List(Option(String)), did: String) {
  uris
  |> list.filter_map(fn(uri) {
    case uri {
      Some(uri) if uri != "" ->
        case at_uri_repo(uri) {
          Ok(repo) if repo == did -> Ok(uri)
          _ -> Error(Nil)
        }
      _ -> Error(Nil)
    }
  })
}

pub fn remove(ctx: Context, agent: agent.Agent, user_did: String, uri: String) {
  use _ <- task.then(task.from_result(owner(uri, user_did)))
  let entries = pt.table()
  let playlists = p.table()
  use rows <- task.then(
    select(entries, field("uri", pt.uri(entries)))
    |> inner_join(
      playlists,
      eq_columns(pt.playlist_id(entries), p.id(playlists)),
    )
    |> where(eq(p.uri(playlists), Some(uri)))
    |> all(ctx.db),
  )
  use repo <- task.then(did(agent))
  use _ <- task.then(
    task.each_(own(rows, user_did), fn(uri) {
      task.attempt_result(agent.delete_record(
        agent,
        repo,
        playlist_song_collection,
        agent.rkey_of(uri),
      ))
    }),
  )
  task.attempt_result(agent.delete_record(
    agent,
    repo,
    playlist_collection,
    agent.rkey_of(uri),
  ))
}

pub fn remove_track(
  ctx: Context,
  agent: agent.Agent,
  user_did: String,
  uri: String,
  song: Option(String),
  index: Option(Int),
) {
  let entries = pt.table()
  let playlists = p.table()
  let tracks = t.table()
  use rows <- task.then(
    select(
      entries,
      pair(field("uri", pt.uri(entries)), field("song", t.uri(tracks))),
    )
    |> inner_join(
      playlists,
      eq_columns(pt.playlist_id(entries), p.id(playlists)),
    )
    |> inner_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
    |> where(eq(p.uri(playlists), Some(uri)))
    |> order_by([asc(pt.added_at(entries)), asc(pt.created_at(entries))])
    |> all(ctx.db),
  )
  use targets <- task.then(case index {
    Some(n) ->
      case n < 0 {
        True ->
          task.fail(error.RequestError("NotFound", "No track at that position"))
        False -> {
          use row <- task.then(
            rows
            |> list.drop(n)
            |> list.first
            |> result.map_error(fn(_) {
              error.RequestError("NotFound", "No track at that position")
            })
            |> task.from_result,
          )
          case song {
            Some(s) if s != "" && Some(s) != row.1 ->
              task.fail(error.RequestError(
                "Conflict",
                "The playlist changed since you loaded it",
              ))
            _ -> task.ok([row])
          }
        }
      }
    None ->
      case song {
        Some(s) if s != "" ->
          task.ok(list.filter(rows, fn(row) { row.1 == Some(s) }))
        _ -> task.fail(error.InvalidRequest("Pass either index or songUri"))
      }
  })
  let owned = own(list.map(targets, fn(row) { row.0 }), user_did)
  use _ <- task.then(case owned, targets {
    [], [] ->
      task.fail(error.RequestError("NotFound", "Track not found in playlist"))
    [], _ ->
      task.fail(error.RequestError(
        "Forbidden",
        "That track was added by someone else",
      ))
    _, _ -> task.ok(Nil)
  })
  use repo <- task.then(did(agent))
  task.each_(owned, fn(uri) {
    task.attempt_result(agent.delete_record(
      agent,
      repo,
      playlist_song_collection,
      agent.rkey_of(uri),
    ))
  })
}
