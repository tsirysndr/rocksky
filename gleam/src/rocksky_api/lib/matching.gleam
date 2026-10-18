import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/helpers
import rocksky_api/lib/track.{type Track, type TrackArtist}
import rocksky_api/node/abort
import rocksky_api/node/axios
import rocksky_api/node/crypto
import rocksky_api/task

pub type Identifiers {
  Identifiers(
    recording: Option(String),
    release: Option(String),
    isrc: Option(String),
    spotify: Option(String),
    deezer: Option(String),
  )
}

pub type Candidate {
  Candidate(
    source: String,
    id: String,
    title: String,
    artists: List(String),
    album: Option(String),
    album_artist: Option(String),
    duration_ms: Option(Float),
    album_art: Option(String),
    release_date: Option(String),
    identifiers: Identifiers,
    track_number: Option(Float),
    disc_number: Option(Float),
    label: Option(String),
    genres: Option(List(String)),
    artist_picture: Option(String),
    musicbrainz_artists: Option(List(TrackArtist)),
    spotify_link: Option(String),
    provider_score: Option(Float),
    provider_rank: Option(Int),
    provider_link: Option(String),
    preview: Option(String),
  )
}

pub type Request {
  Request(
    title: String,
    artists: List(String),
    album: Option(String),
    album_artist: Option(String),
    duration_ms: Option(Int),
    identifiers: Identifiers,
  )
}

pub type Response {
  Response(
    policy_version: String,
    status: String,
    track: Option(Candidate),
    candidates: List(Candidate),
    warnings: List(String),
  )
}

fn opt(key, decoder, next) {
  decode.optional_field(key, None, decode.optional(decoder), next)
}

pub fn candidate_decoder() {
  use source <- decode.field("source", decode.string)
  use id <- decode.field("id", decode.string)
  use title <- decode.field("title", decode.string)
  use artists <- decode.field("artists", decode.list(decode.string))
  use album <- opt("album", decode.string)
  use album_artist <- opt("albumArtist", decode.string)
  use duration_ms <- opt("durationMs", decode.float)
  use album_art <- opt("albumArt", decode.string)
  use release_date <- opt("releaseDate", decode.string)
  use identifiers <- decode.field("identifiers", {
    use recording <- opt("musicbrainzRecordingId", decode.string)
    use release <- opt("musicbrainzReleaseId", decode.string)
    use isrc <- opt("isrc", decode.string)
    use spotify <- opt("spotifyTrackId", decode.string)
    use deezer <- opt("deezerTrackId", decode.string)
    decode.success(Identifiers(recording, release, isrc, spotify, deezer))
  })
  use track_number <- opt("trackNumber", decode.float)
  use disc_number <- opt("discNumber", decode.float)
  use label <- opt("label", decode.string)
  use genres <- opt("genres", decode.list(decode.string))
  use artist_picture <- opt("artistPicture", decode.string)
  use musicbrainz_artists <- opt(
    "musicbrainzArtists",
    decode.list({
      use mbid <- decode.field("mbid", decode.string)
      use name <- decode.field("name", decode.string)
      decode.success(track.TrackArtist(Some(mbid), name))
    }),
  )
  use spotify_link <- opt("spotifyLink", decode.string)
  use provider_score <- opt("providerScore", decode.float)
  use provider_rank <- opt("providerRank", decode.int)
  use provider_link <- opt("providerLink", decode.string)
  use preview <- opt("preview", decode.string)
  let value =
    Candidate(
      source:,
      id:,
      title:,
      artists:,
      album:,
      album_artist:,
      duration_ms:,
      album_art:,
      release_date:,
      identifiers:,
      track_number:,
      disc_number:,
      label:,
      genres:,
      artist_picture:,
      musicbrainz_artists:,
      spotify_link:,
      provider_score:,
      provider_rank:,
      provider_link:,
      preview:,
    )
  case
    artists != []
    && option.unwrap(
      option.map(provider_score, fn(s) { s >=. 0.0 && s <=. 100.0 }),
      True,
    )
  {
    True -> decode.success(value)
    False ->
      decode.failure(
        value,
        "Candidate with artists and a score between 0 and 100",
      )
  }
}

pub fn response_decoder() {
  use policy_version <- decode.field("policyVersion", decode.string)
  use status <- decode.field("status", decode.string)
  use track <- decode.field("track", decode.optional(candidate_decoder()))
  use candidates <- decode.optional_field(
    "candidates",
    [],
    decode.list(decode.at(["track"], candidate_decoder())),
  )
  use warnings <- decode.optional_field(
    "warnings",
    [],
    decode.list(decode.string),
  )
  let response = Response(policy_version, status, track, candidates, warnings)
  case
    list.contains(["matched", "ambiguous", "unmatched"], status)
    && { { status == "matched" } == option.is_some(track) }
  {
    True -> decode.success(response)
    False -> decode.failure(response, "Consistent matching status and track")
  }
}

pub fn spotify_track_id(value: Option(String)) {
  use value <- option.then(value)
  let value = string.trim(value)
  let value = case string.starts_with(value, "spotify:track:") {
    True -> Some(string.drop_start(value, 14))
    False ->
      case string.contains(value, "://") {
        True -> spotify_url_id(value)
        False -> Some(value)
      }
  }
  use value <- option.then(value)
  case
    string.length(value) == 22
    && list.all(string.to_graphemes(value), fn(c) {
      string.contains(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
        c,
      )
    })
  {
    True -> Some(value)
    False -> None
  }
}

@external(javascript, "./matching_ffi.mjs", "spotifyUrlId")
fn spotify_url_id(value: String) -> Option(String)

pub fn request(
  title: String,
  artist: String,
  artists: Option(List(TrackArtist)),
  album: Option(String),
  album_artist: Option(String),
  duration: Option(Int),
  mbid: Option(String),
  isrc: Option(String),
  spotify: Option(String),
) {
  case string.trim(title) == "" || string.trim(artist) == "" {
    True -> Error(error.InvalidRequest("Matching requires title and artist"))
    False ->
      Ok(Request(
        title,
        case artists {
          Some([_, ..] as artists) -> list.map(artists, fn(a) { a.name })
          _ -> [artist]
        },
        helpers.non_empty(album),
        helpers.non_empty(album_artist),
        option.then(duration, fn(d) {
          case d > 1 {
            True -> Some(d)
            False -> None
          }
        }),
        Identifiers(
          helpers.non_empty(mbid),
          None,
          helpers.non_empty(isrc),
          spotify_track_id(spotify),
          None,
        ),
      ))
  }
}

pub fn matching_request(track: Track) {
  request(
    track.title,
    track.artist,
    track.artists,
    Some(track.album),
    Some(track.album_artist),
    Some(track.duration),
    track.mb_id,
    track.isrc,
    track.spotify_link,
  )
}

fn optional(key: String, value: Option(a), encode: fn(a) -> json.Json) {
  case value {
    Some(v) -> [#(key, encode(v))]
    None -> []
  }
}

pub fn encode_request(request: Request) {
  json.object([
    #("title", json.string(request.title)),
    #("artists", json.array(request.artists, json.string)),
    ..list.flatten([
      optional("album", request.album, json.string),
      optional("albumArtist", request.album_artist, json.string),
      optional("durationMs", request.duration_ms, json.int),
      [
        #(
          "identifiers",
          json.object(
            list.flatten([
              optional(
                "musicbrainzRecordingId",
                request.identifiers.recording,
                json.string,
              ),
              optional(
                "musicbrainzReleaseId",
                request.identifiers.release,
                json.string,
              ),
              optional("isrc", request.identifiers.isrc, json.string),
              optional(
                "spotifyTrackId",
                request.identifiers.spotify,
                json.string,
              ),
              optional("deezerTrackId", request.identifiers.deezer, json.string),
            ]),
          ),
        ),
      ],
    ])
  ])
}

pub fn matching_cache_key(request: Request) {
  "matching:v1:" <> crypto.sha256_hex(json.to_string(encode_request(request)))
}

pub fn resolve_match(
  ctx: Context,
  request: Request,
  signal: Option(abort.Signal),
) {
  use _ <- task.then(case signal {
    None -> task.ok(Nil)
    Some(signal) -> abort.check(signal) |> error.map_js |> task.from_result
  })
  use response <- task.then(
    task.attempt_result(axios.post_with_signal(
      ctx.matching,
      "/v1/match",
      encode_request(request),
      signal,
    )),
  )
  task.from_result(
    decode.run(response.data, response_decoder())
    |> error.decode("matching response", _),
  )
}

pub fn match_track(
  ctx: Context,
  request: Request,
  signal: Option(abort.Signal),
) {
  resolve_match(ctx, request, signal) |> task.map(fn(r) { r.track })
}

pub fn spotify_link(candidate: Candidate) {
  option.or(
    candidate.spotify_link,
    option.map(candidate.identifiers.spotify, fn(id) {
      "https://open.spotify.com/track/" <> id
    }),
  )
}

pub fn deezer_link(candidate: Candidate) {
  option.map(candidate.identifiers.deezer, fn(id) {
    "https://www.deezer.com/track/" <> id
  })
}

pub fn year(candidate: Candidate) {
  option.then(candidate.release_date, fn(d) {
    d
    |> string.split("-")
    |> list.first
    |> result.try(int.parse)
    |> option.from_result
    |> option.then(fn(y) {
      case y == 0 {
        True -> None
        False -> Some(y)
      }
    })
  })
}

pub fn integer(value: Option(Float)) {
  option.map(value, float.truncate)
}
