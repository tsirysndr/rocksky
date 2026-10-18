import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  count, eq, field, from, one, required, select, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/matching.{type Candidate}
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/tracks
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/song/match_song_uris
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(server, "app.rocksky.song.matchSong", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("matchSong")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate),
      models.match_song_params_decoder(),
    )
    use response <- task.map(retrieve_match(ctx, params))
    case response {
      None -> json.object([#("matches", json.array([], json.string))])
      Some(view) -> encode(view)
    }
  })
}

fn nonempty(value: Option(String)) {
  case value {
    Some("") -> None
    _ -> value
  }
}

fn artists(candidate: Candidate) {
  option.map(candidate.musicbrainz_artists, fn(artists) {
    list.map(artists, fn(a) {
      models.SongResponseMbArtistsItemView(a.mbid, Some(a.name))
    })
  })
}

pub fn candidate_match(c: Candidate) {
  let deezer = case c.source {
    "deezer" ->
      int.parse(option.unwrap(c.identifiers.deezer, c.id))
      |> option.from_result
      |> option.then(fn(n) {
        case n > 0 && n <= 9_007_199_254_740_991 {
          True -> Some(n)
          False -> None
        }
      })
    _ -> None
  }
  let link =
    option.or(nonempty(c.provider_link), case c.source {
      "deezer" -> matching.deezer_link(c)
      "spotify" -> matching.spotify_link(c)
      "musicbrainz" ->
        option.map(nonempty(c.identifiers.recording), fn(id) {
          "https://musicbrainz.org/recording/" <> id
        })
      _ -> None
    })
  models.SongMatchView(
    ..models.new_song_match_view(),
    score: option.map(c.provider_score, float.round),
    rank: c.provider_rank,
    source: Some(c.source),
    provider_id: Some(c.id),
    id: deezer,
    title: Some(c.title),
    artist: Some(string.join(c.artists, ", ")),
    album: c.album,
    album_art: c.album_art,
    isrc: c.identifiers.isrc,
    duration_ms: matching.integer(c.duration_ms),
    track_number: matching.integer(c.track_number),
    disc_number: matching.integer(c.disc_number),
    mb_id: c.identifiers.recording,
    mb_release_id: c.identifiers.release,
    mb_artists: artists(c),
    preview: nonempty(c.preview),
    link: link,
  )
}

pub fn retrieve_match(ctx: Context, params: models.MatchSongParams) {
  use request <- task.then(
    matching.request(
      params.title,
      params.artist,
      None,
      params.album,
      None,
      None,
      params.mb_id,
      params.isrc,
      None,
    )
    |> task.from_result,
  )
  use response <- task.then(matching.resolve_match(ctx, request, None))
  let candidate =
    option.or(response.track, case response.status {
      "ambiguous" -> list.first(response.candidates) |> option.from_result
      _ -> None
    })
  case candidate {
    None -> task.ok(None)
    Some(candidate) -> {
      let table = t.table()
      use selected <- task.then(case candidate.source {
        "catalog" ->
          from(table)
          |> where(eq(t.id(table), candidate.id))
          |> one(ctx.read_db)
        _ -> task.ok(None)
      })
      use identity <- task.then(match_song_uris.catalog_identity(
        ctx,
        candidate,
        selected,
      ))
      let now = row.iso8601(row.from_unix_ms(js.now_ms()))
      let base =
        models.SongViewDetailed(
          ..models.new_song_view_detailed(),
          id: Some(""),
          title: Some(candidate.title),
          artist: Some(string.join(candidate.artists, ", ")),
          album: Some(option.unwrap(candidate.album, "")),
          album_artist: option.or(
            candidate.album_artist,
            list.first(candidate.artists) |> option.from_result,
          ),
          album_art: candidate.album_art,
          duration: Some(option.unwrap(
            matching.integer(candidate.duration_ms),
            0,
          )),
          mb_id: candidate.identifiers.recording,
          isrc: candidate.identifiers.isrc,
          track_number: matching.integer(candidate.track_number),
          disc_number: matching.integer(candidate.disc_number),
          genre: option.map(candidate.genres, string.join(_, ", ")),
          label: candidate.label,
          spotify_link: matching.spotify_link(candidate),
          sha256: Some(""),
          created_at: Some(now),
          updated_at: Some(now),
          xata_version: Some(0),
        )
      let catalog_fields = case identity.record {
        None -> []
        Some(record) ->
          tracks.to_json(record)
          |> js.coerce
          |> js.entries
          |> list.filter(fn(p) {
            !js.is_nullish(p.1)
            && decode.run(p.1, decode.string) != Ok("")
            && { p.0 != "duration" || record.duration > 1 }
          })
          |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
      }
      let catalog_keys = list.map(catalog_fields, fn(p) { p.0 })
      let base_fields =
        models.encode_song_view_detailed(base)
        |> js.coerce
        |> js.entries
        |> list.filter(fn(p) { !list.contains(catalog_keys, p.0) })
        |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
      use view <- task.then(
        json.object(list.append(base_fields, catalog_fields))
        |> js.coerce
        |> decode.run(models.song_view_detailed_decoder())
        |> error.decode("matched song", _)
        |> task.from_result,
      )
      let genres = case nonempty(view.genre) {
        Some(genre) ->
          Some(string.split(genre, ", ") |> list.filter(fn(v) { v != "" }))
        None ->
          option.or(
            candidate.genres,
            option.then(identity.artist, fn(a) { a.genres }),
          )
      }
      let user_tracks = ut.table()
      let scrobbles = sc.table()
      use counts <- task.map(case identity.record {
        None -> task.ok(#(0, 0))
        Some(record) ->
          task.all2(
            select(user_tracks, field("count", count()))
              |> where(eq(ut.track_id(user_tracks), record.id))
              |> required(ctx.read_db, "Missing listener count"),
            select(scrobbles, field("count", count()))
              |> where(eq(sc.track_id(scrobbles), Some(record.id)))
              |> required(ctx.read_db, "Missing play count"),
          )
      })
      Some(
        models.SongViewDetailed(
          ..view,
          title: Some(candidate.title),
          artist: Some(string.join(candidate.artists, ", ")),
          album: Some(option.unwrap(candidate.album, "")),
          album_artist: option.or(candidate.album_artist, view.album_artist),
          album_art: option.or(
            identity.album |> option.then(fn(a) { a.album_art }) |> nonempty,
            view.album_art,
          ),
          uri: identity.uri,
          album_uri: identity.album_uri,
          artist_uri: identity.artist_uri,
          release_date: option.or(
            identity.album |> option.then(fn(a) { a.release_date }) |> nonempty,
            candidate.release_date
              |> option.then(fn(d) {
                case string.length(d) == 10 {
                  True -> Some(d)
                  False -> None
                }
              }),
          ),
          year: option.or(
            option.then(identity.album, fn(a) { a.year }),
            matching.year(candidate),
          ),
          artist_picture: option.or(
            identity.artist |> option.then(fn(a) { a.picture }) |> nonempty,
            nonempty(candidate.artist_picture),
          ),
          genres: genres,
          genre: option.or(
            nonempty(view.genre),
            option.map(genres, string.join(_, ", ")) |> nonempty,
          ),
          mb_artists: artists(candidate),
          matches: Some(
            response.candidates
            |> list.filter(fn(c) { c.source != "catalog" })
            |> list.map(candidate_match),
          ),
          unique_listeners: Some(counts.0),
          play_count: Some(counts.1),
        ),
      )
    }
  }
}

fn encode(v: models.SongViewDetailed) {
  // These metadata fields are explicitly null in the source's open response.
  let nullable = [
    #("uri", json.nullable(v.uri, json.string)),
    #("albumUri", json.nullable(v.album_uri, json.string)),
    #("artistUri", json.nullable(v.artist_uri, json.string)),
    #("albumArt", json.nullable(v.album_art, json.string)),
    #("mbId", json.nullable(v.mb_id, json.string)),
    #("isrc", json.nullable(v.isrc, json.string)),
    #("trackNumber", json.nullable(v.track_number, json.int)),
    #("discNumber", json.nullable(v.disc_number, json.int)),
    #("genre", json.nullable(v.genre, json.string)),
    #("label", json.nullable(v.label, json.string)),
    #("spotifyLink", json.nullable(v.spotify_link, json.string)),
    #("youtubeLink", json.nullable(v.youtube_link, json.string)),
    #("appleMusicLink", json.nullable(v.apple_music_link, json.string)),
    #("tidalLink", json.nullable(v.tidal_link, json.string)),
    #("lyrics", json.nullable(v.lyrics, json.string)),
    #("composer", json.nullable(v.composer, json.string)),
    #("copyrightMessage", json.nullable(v.copyright_message, json.string)),
    #("key", json.nullable(v.key, json.string)),
    #("bpm", json.nullable(v.bpm, json.float)),
    #("acoustidFingerprint", json.nullable(v.acoustid_fingerprint, json.string)),
    #("releaseDate", json.nullable(v.release_date, json.string)),
    #("year", json.nullable(v.year, json.int)),
    #("artistPicture", json.nullable(v.artist_picture, json.string)),
    #("genres", json.nullable(v.genres, fn(xs) { json.array(xs, json.string) })),
    #(
      "mbArtists",
      json.nullable(v.mb_artists, fn(xs) {
        json.array(xs, models.encode_song_response_mb_artists_item_view)
      }),
    ),
  ]
  let keys = list.map(nullable, fn(p) { p.0 })
  let fields =
    models.encode_song_view_detailed(v)
    |> js.coerce
    |> js.entries
    |> list.filter(fn(p) { !list.contains(keys, p.0) })
    |> list.map(fn(p) { #(p.0, row.dynamic_to_json(p.1)) })
  json.object(list.append(fields, nullable))
}
