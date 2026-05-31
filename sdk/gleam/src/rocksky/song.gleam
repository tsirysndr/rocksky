//// `app.rocksky.song.*` — fetch and create song records.

import gleam/json
import gleam/option.{type Option, None, Some}
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Listener, type Song}

/// `app.rocksky.song.getSong` — fetch a song by AT-URI. Combine with
/// `with_mbid`, `with_isrc`, or `with_spotify_id` instead of (or in addition
/// to) the URI; the server matches on any provided field.
pub fn get_song(uri uri: String) -> Request(Song) {
  rocksky.query("app.rocksky.song.getSong", decoders.song())
  |> rocksky.param("uri", uri)
}

/// Variant of `get_song` keyed by MusicBrainz ID instead of URI.
pub fn get_song_by_mbid(mbid mbid: String) -> Request(Song) {
  rocksky.query("app.rocksky.song.getSong", decoders.song())
  |> rocksky.param("mbid", mbid)
}

/// Variant of `get_song` keyed by ISRC.
pub fn get_song_by_isrc(isrc isrc: String) -> Request(Song) {
  rocksky.query("app.rocksky.song.getSong", decoders.song())
  |> rocksky.param("isrc", isrc)
}

/// Variant of `get_song` keyed by Spotify track ID.
pub fn get_song_by_spotify_id(spotify_id spotify_id: String) -> Request(Song) {
  rocksky.query("app.rocksky.song.getSong", decoders.song())
  |> rocksky.param("spotifyId", spotify_id)
}

pub fn with_mbid(req: Request(a), mbid: String) -> Request(a) {
  rocksky.param(req, "mbid", mbid)
}

pub fn with_isrc(req: Request(a), isrc: String) -> Request(a) {
  rocksky.param(req, "isrc", isrc)
}

pub fn with_spotify_id(req: Request(a), id: String) -> Request(a) {
  rocksky.param(req, "spotifyId", id)
}

/// `app.rocksky.song.getSongs` — paginated songs catalogue. Refine with
/// `rocksky.limit`, `rocksky.offset`, `rocksky.genre`, `with_mbid`,
/// `with_isrc`, `with_spotify_id`.
pub fn get_songs() -> Request(List(Song)) {
  rocksky.query(
    "app.rocksky.song.getSongs",
    decoders.unwrap("songs", decoders.song()),
  )
}

/// `app.rocksky.song.getSongRecentListeners` — recent listeners of a song.
pub fn get_song_recent_listeners(uri uri: String) -> Request(List(Listener)) {
  rocksky.query(
    "app.rocksky.song.getSongRecentListeners",
    decoders.unwrap("listeners", decoders.listener()),
  )
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.song.matchSong` — find an existing song record matching the
/// given metadata.
pub fn match_song(title title: String, artist artist: String) -> Request(Song) {
  rocksky.query("app.rocksky.song.matchSong", decoders.song())
  |> rocksky.param("title", title)
  |> rocksky.param("artist", artist)
}

// ---------------------------------------------------------------------------
// createSong builder
// ---------------------------------------------------------------------------

/// Builder for a `createSong` payload. Build one with `new_song(...)` and
/// pipe it through `with_*` setters, then `create` to get a `Request`.
pub type NewSong {
  NewSong(
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    duration: Option(Int),
    mb_id: Option(String),
    isrc: Option(String),
    album_art: Option(String),
    track_number: Option(Int),
    release_date: Option(String),
    year: Option(Int),
    disc_number: Option(Int),
    lyrics: Option(String),
  )
}

pub fn new_song(
  title title: String,
  artist artist: String,
  album_artist album_artist: String,
  album album: String,
) -> NewSong {
  NewSong(
    title: title,
    artist: artist,
    album_artist: album_artist,
    album: album,
    duration: None,
    mb_id: None,
    isrc: None,
    album_art: None,
    track_number: None,
    release_date: None,
    year: None,
    disc_number: None,
    lyrics: None,
  )
}

pub fn song_with_duration_ms(s: NewSong, v: Int) -> NewSong {
  NewSong(..s, duration: Some(v))
}

pub fn song_with_mb_id(s: NewSong, v: String) -> NewSong {
  NewSong(..s, mb_id: Some(v))
}

pub fn song_with_isrc(s: NewSong, v: String) -> NewSong {
  NewSong(..s, isrc: Some(v))
}

pub fn song_with_album_art(s: NewSong, v: String) -> NewSong {
  NewSong(..s, album_art: Some(v))
}

pub fn song_with_track_number(s: NewSong, v: Int) -> NewSong {
  NewSong(..s, track_number: Some(v))
}

pub fn song_with_release_date(s: NewSong, v: String) -> NewSong {
  NewSong(..s, release_date: Some(v))
}

pub fn song_with_year(s: NewSong, v: Int) -> NewSong {
  NewSong(..s, year: Some(v))
}

pub fn song_with_disc_number(s: NewSong, v: Int) -> NewSong {
  NewSong(..s, disc_number: Some(v))
}

pub fn song_with_lyrics(s: NewSong, v: String) -> NewSong {
  NewSong(..s, lyrics: Some(v))
}

/// Convert a `NewSong` into a `Request(Song)` ready for `rocksky.send`.
pub fn create(s: NewSong) -> Request(Song) {
  rocksky.procedure("app.rocksky.song.createSong", decoders.song())
  |> rocksky.body(new_song_to_json(s))
}

fn new_song_to_json(s: NewSong) -> json.Json {
  json.object(
    [
      #("title", json.string(s.title)),
      #("artist", json.string(s.artist)),
      #("albumArtist", json.string(s.album_artist)),
      #("album", json.string(s.album)),
    ]
    |> add_opt_int("duration", s.duration)
    |> add_opt_string("mbId", s.mb_id)
    |> add_opt_string("isrc", s.isrc)
    |> add_opt_string("albumArt", s.album_art)
    |> add_opt_int("trackNumber", s.track_number)
    |> add_opt_string("releaseDate", s.release_date)
    |> add_opt_int("year", s.year)
    |> add_opt_int("discNumber", s.disc_number)
    |> add_opt_string("lyrics", s.lyrics),
  )
}

fn add_opt_string(
  fields: List(#(String, json.Json)),
  key: String,
  value: Option(String),
) -> List(#(String, json.Json)) {
  case value {
    Some(v) -> [#(key, json.string(v)), ..fields]
    None -> fields
  }
}

fn add_opt_int(
  fields: List(#(String, json.Json)),
  key: String,
  value: Option(Int),
) -> List(#(String, json.Json)) {
  case value {
    Some(v) -> [#(key, json.int(v)), ..fields]
    None -> fields
  }
}
