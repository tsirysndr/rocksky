//// The scrobble/now-playing payload (`types/track.ts`).

import gleam/int

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode.{type Decoder}
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/error.{type Error}
import rocksky_api/lib/helpers

pub type TrackArtist {
  TrackArtist(mbid: Option(String), name: String)
}

pub type Track {
  Track(
    title: String,
    artist: String,
    artists: Option(List(TrackArtist)),
    album: String,
    album_artist: String,
    duration: Int,
    mb_id: Option(String),
    isrc: Option(String),
    album_art: Option(String),
    track_number: Option(Int),
    /// `YYYY-MM-DD`
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
    youtube_link: Option(String),
    tidal_link: Option(String),
    apple_music_link: Option(String),
    deezer_link: Option(String),
    timestamp: Option(Int),
    genres: Option(List(String)),
  )
}

fn canonical() -> Decoder(String) {
  use s <- decode.then(decode.string)
  case string.trim(s) {
    "" -> decode.failure("", "NonEmptyString")
    t -> decode.success(helpers.canonical_text(t))
  }
}

fn opt(
  name: String,
  inner: Decoder(a),
  next: fn(Option(a)) -> Decoder(b),
) -> Decoder(b) {
  decode.optional_field(name, None, decode.optional(inner), next)
}

fn position_number() -> Decoder(Int) {
  decode.one_of(decode.int, [
    decode.float
    |> decode.map(fn(n) {
      let truncated = float_truncate(n)
      case int.to_float(truncated) == n {
        True -> truncated
        False -> 1
      }
    }),
  ])
}

fn number() -> Decoder(Int) {
  decode.one_of(decode.int, [decode.float |> decode.map(float_truncate)])
}

@external(javascript, "./track_ffi.mjs", "truncate")
fn float_truncate(f: Float) -> Int

fn release_date() -> Decoder(String) {
  use s <- decode.then(decode.string)
  case is_ymd(s) {
    True -> decode.success(s)
    False -> decode.failure("", "YYYY-MM-DD")
  }
}

@external(javascript, "./track_ffi.mjs", "isYmd")
fn is_ymd(s: String) -> Bool

pub fn decoder() -> Decoder(Track) {
  use title <- decode.field("title", canonical())
  use artist <- decode.field("artist", canonical())
  use artists <- opt(
    "artists",
    decode.list({
      use mbid <- opt("mbid", decode.string)
      use name <- decode.field("name", canonical())
      decode.success(TrackArtist(mbid:, name:))
    }),
  )
  use album <- decode.field("album", canonical())
  use album_artist <- decode.field("albumArtist", canonical())
  use duration <- decode.field("duration", number())
  use mb_id <- opt("mbId", decode.string)
  use isrc <- opt("isrc", decode.string)
  use album_art <- opt("albumArt", decode.string)
  use track_number <- opt("trackNumber", position_number())
  use release_date <- opt("releaseDate", release_date())
  use year <- opt("year", number())
  use disc_number <- opt("discNumber", position_number())
  use lyrics <- opt("lyrics", decode.string)
  use composer <- opt("composer", decode.string)
  use copyright_message <- opt("copyrightMessage", decode.string)
  use label <- opt("label", decode.string)
  use artist_picture <- opt("artistPicture", decode.string)
  use spotify_link <- opt("spotifyLink", decode.string)
  use lastfm_link <- opt("lastfmLink", decode.string)
  use youtube_link <- opt("youtubeLink", decode.string)
  use tidal_link <- opt("tidalLink", decode.string)
  use apple_music_link <- opt("appleMusicLink", decode.string)
  use deezer_link <- opt("deezerLink", decode.string)
  use timestamp <- opt("timestamp", number())
  use genres <- opt("genres", decode.list(decode.string))
  decode.success(Track(
    title:,
    artist:,
    artists:,
    album:,
    album_artist:,
    duration:,
    mb_id:,
    isrc:,
    album_art:,
    track_number:,
    release_date:,
    year:,
    disc_number:,
    lyrics:,
    composer:,
    copyright_message:,
    label:,
    artist_picture:,
    spotify_link:,
    lastfm_link:,
    youtube_link:,
    tidal_link:,
    apple_music_link:,
    deezer_link:,
    timestamp:,
    genres:,
  ))
}

pub fn parse(body: Dynamic) -> Result(Track, Error) {
  decode.run(body, decoder()) |> error.decode("track", _)
}

fn field(name: String, value: Option(Json)) -> List(#(String, Json)) {
  case value {
    Some(v) -> [#(name, v)]
    None -> []
  }
}

/// The payload as the Rust submissions service expects it.
pub fn to_json(t: Track) -> Json {
  json.object(
    list.flatten([
      [#("title", json.string(t.title))],
      [#("artist", json.string(t.artist))],
      field(
        "artists",
        option.map(t.artists, fn(a) {
          json.array(a, fn(x) {
            json.object(
              list.flatten([
                field("mbid", option.map(x.mbid, json.string)),
                [#("name", json.string(x.name))],
              ]),
            )
          })
        }),
      ),
      [#("album", json.string(t.album))],
      [#("albumArtist", json.string(t.album_artist))],
      [#("duration", json.int(t.duration))],
      field("mbId", option.map(t.mb_id, json.string)),
      field("isrc", option.map(t.isrc, json.string)),
      field("albumArt", option.map(t.album_art, json.string)),
      field("trackNumber", option.map(t.track_number, json.int)),
      field("releaseDate", option.map(t.release_date, json.string)),
      field("year", option.map(t.year, json.int)),
      field("discNumber", option.map(t.disc_number, json.int)),
      field("lyrics", option.map(t.lyrics, json.string)),
      field("composer", option.map(t.composer, json.string)),
      field("copyrightMessage", option.map(t.copyright_message, json.string)),
      field("label", option.map(t.label, json.string)),
      field("artistPicture", option.map(t.artist_picture, json.string)),
      field("spotifyLink", option.map(t.spotify_link, json.string)),
      field("lastfmLink", option.map(t.lastfm_link, json.string)),
      field("youtubeLink", option.map(t.youtube_link, json.string)),
      field("tidalLink", option.map(t.tidal_link, json.string)),
      field("appleMusicLink", option.map(t.apple_music_link, json.string)),
      field("deezerLink", option.map(t.deezer_link, json.string)),
      field("timestamp", option.map(t.timestamp, json.int)),
      field(
        "genres",
        option.map(t.genres, fn(g) { json.array(g, json.string) }),
      ),
    ]),
  )
}

/// sha256 input: `title - artist - album`, lower-cased.
pub fn identity(t: Track) -> String {
  string.lowercase(t.title <> " - " <> t.artist <> " - " <> t.album)
}

pub fn album_identity(t: Track) -> String {
  string.lowercase(t.album <> " - " <> t.album_artist)
}

pub fn artist_identity(t: Track) -> String {
  string.lowercase(t.album_artist)
}

pub fn new(
  title: String,
  artist: String,
  album: String,
  duration: Int,
) -> Track {
  Track(
    title: title,
    artist: artist,
    artists: None,
    album: album,
    album_artist: artist,
    duration: duration,
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
    youtube_link: None,
    tidal_link: None,
    apple_music_link: None,
    deezer_link: None,
    timestamp: None,
    genres: None,
  )
}
