//// `app.rocksky.scrobble.*` — record listens and read them back.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option, None, Some}
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Scrobble}

/// `app.rocksky.scrobble.getScrobble` — fetch a single scrobble by AT-URI.
pub fn get_scrobble(uri uri: String) -> Request(Scrobble) {
  rocksky.query("app.rocksky.scrobble.getScrobble", decoders.scrobble())
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.scrobble.getScrobbles` — paginated scrobble feed. Refine
/// with `rocksky.limit`, `rocksky.offset`, `with_did`, `with_following`.
pub fn get_scrobbles() -> Request(Dynamic) {
  rocksky.query("app.rocksky.scrobble.getScrobbles", decode.dynamic)
}

pub fn with_did(req: Request(a), did: String) -> Request(a) {
  rocksky.param(req, "did", did)
}

pub fn with_following(req: Request(a), following: Bool) -> Request(a) {
  rocksky.bool_param(req, "following", following)
}

// ---------------------------------------------------------------------------
// createScrobble builder
// ---------------------------------------------------------------------------

/// Builder for a `createScrobble` payload. The `title` and `artist` fields
/// are required by the lexicon; everything else is optional. Build one with
/// `new_scrobble(...)`, layer `with_*` setters, then call `create` to
/// produce a `Request(Scrobble)`.
pub type NewScrobble {
  NewScrobble(
    title: String,
    artist: String,
    album: Option(String),
    duration_ms: Option(Int),
    mb_id: Option(String),
    isrc: Option(String),
    album_art: Option(String),
    track_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    disc_number: Option(Int),
    lyrics: Option(String),
    composer: Option(String),
    copyright_message: Option(String),
    label: Option(String),
    artist_picture: Option(String),
    spotify_link: Option(String),
    lastfm_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    youtube_link: Option(String),
    deezer_link: Option(String),
    timestamp: Option(Int),
  )
}

pub fn new_scrobble(title title: String, artist artist: String) -> NewScrobble {
  NewScrobble(
    title: title,
    artist: artist,
    album: None,
    duration_ms: None,
    mb_id: None,
    isrc: None,
    album_art: None,
    track_number: None,
    release_date: None,
    year: None,
    disc_number: None,
    lyrics: None,
    composer: None,
    copyright_message: None,
    label: None,
    artist_picture: None,
    spotify_link: None,
    lastfm_link: None,
    tidal_link: None,
    apple_music_link: None,
    youtube_link: None,
    deezer_link: None,
    timestamp: None,
  )
}

pub fn with_album(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, album: Some(v))
}

pub fn with_duration_ms(s: NewScrobble, v: Int) -> NewScrobble {
  NewScrobble(..s, duration_ms: Some(v))
}

pub fn with_mb_id(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, mb_id: Some(v))
}

pub fn with_isrc(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, isrc: Some(v))
}

pub fn with_album_art(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, album_art: Some(v))
}

pub fn with_track_number(s: NewScrobble, v: Int) -> NewScrobble {
  NewScrobble(..s, track_number: Some(v))
}

pub fn with_release_date(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, release_date: Some(v))
}

pub fn with_year(s: NewScrobble, v: Int) -> NewScrobble {
  NewScrobble(..s, year: Some(v))
}

pub fn with_disc_number(s: NewScrobble, v: Int) -> NewScrobble {
  NewScrobble(..s, disc_number: Some(v))
}

pub fn with_lyrics(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, lyrics: Some(v))
}

pub fn with_composer(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, composer: Some(v))
}

pub fn with_copyright_message(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, copyright_message: Some(v))
}

pub fn with_label(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, label: Some(v))
}

pub fn with_artist_picture(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, artist_picture: Some(v))
}

pub fn with_spotify_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, spotify_link: Some(v))
}

pub fn with_lastfm_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, lastfm_link: Some(v))
}

pub fn with_tidal_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, tidal_link: Some(v))
}

pub fn with_apple_music_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, apple_music_link: Some(v))
}

pub fn with_youtube_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, youtube_link: Some(v))
}

pub fn with_deezer_link(s: NewScrobble, v: String) -> NewScrobble {
  NewScrobble(..s, deezer_link: Some(v))
}

/// Set the scrobble timestamp in Unix seconds. Omit to default to now (server-side).
pub fn with_timestamp(s: NewScrobble, unix_seconds: Int) -> NewScrobble {
  NewScrobble(..s, timestamp: Some(unix_seconds))
}

/// Convert a `NewScrobble` into a `Request(Scrobble)` ready for `rocksky.send`.
/// ```gleam
/// scrobble.new_scrobble(title: "Karma Police", artist: "Radiohead")
/// |> scrobble.with_album("OK Computer")
/// |> scrobble.with_duration_ms(263_000)
/// |> scrobble.create
/// |> rocksky.send(client)
/// ```
pub fn create(s: NewScrobble) -> Request(Scrobble) {
  rocksky.procedure(
    "app.rocksky.scrobble.createScrobble",
    decoders.scrobble(),
  )
  |> rocksky.body(to_json(s))
}

fn to_json(s: NewScrobble) -> json.Json {
  json.object(
    [
      #("title", json.string(s.title)),
      #("artist", json.string(s.artist)),
    ]
    |> opt_string("album", s.album)
    |> opt_int("duration", s.duration_ms)
    |> opt_string("mbId", s.mb_id)
    |> opt_string("isrc", s.isrc)
    |> opt_string("albumArt", s.album_art)
    |> opt_int("trackNumber", s.track_number)
    |> opt_string("releaseDate", s.release_date)
    |> opt_int("year", s.year)
    |> opt_int("discNumber", s.disc_number)
    |> opt_string("lyrics", s.lyrics)
    |> opt_string("composer", s.composer)
    |> opt_string("copyrightMessage", s.copyright_message)
    |> opt_string("label", s.label)
    |> opt_string("artistPicture", s.artist_picture)
    |> opt_string("spotifyLink", s.spotify_link)
    |> opt_string("lastfmLink", s.lastfm_link)
    |> opt_string("tidalLink", s.tidal_link)
    |> opt_string("appleMusicLink", s.apple_music_link)
    |> opt_string("youtubeLink", s.youtube_link)
    |> opt_string("deezerLink", s.deezer_link)
    |> opt_int("timestamp", s.timestamp),
  )
}

fn opt_string(
  fields: List(#(String, json.Json)),
  key: String,
  value: Option(String),
) -> List(#(String, json.Json)) {
  case value {
    Some(v) -> [#(key, json.string(v)), ..fields]
    None -> fields
  }
}

fn opt_int(
  fields: List(#(String, json.Json)),
  key: String,
  value: Option(Int),
) -> List(#(String, json.Json)) {
  case value {
    Some(v) -> [#(key, json.int(v)), ..fields]
    None -> fields
  }
}
