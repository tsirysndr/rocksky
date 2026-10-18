import gleam/dict
import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import gleam/uri
import rocksky_api/db/row
import rocksky_api/lib/track.{type Track, Track}
import rocksky_api/node/js

pub type Picture {
  Picture(format: String, data: Dynamic)
}

pub type Metadata {
  Metadata(
    title: Option(String),
    artist: Option(String),
    album: Option(String),
    album_artist: Option(String),
    duration: Int,
    sample_rate: Option(Int),
    pictures: List(Picture),
    has_gain: Bool,
    track_number: Option(Int),
    disc_number: Option(Int),
    genres: Option(List(String)),
    composer: Option(String),
    date: Option(String),
    year: Option(Int),
    lyrics: Option(String),
    copyright: Option(String),
    mb_id: Option(String),
    isrc: Option(String),
    label: Option(String),
  )
}

pub fn detect_mime(bytes: BitArray) {
  case bytes {
    <<0x49, 0x44, 0x33, _:bits>>
    | <<0xff, 0xfb, _:bits>>
    | <<0xff, 0xf3, _:bits>>
    | <<0xff, 0xf2, _:bits>> -> Some("audio/mpeg")
    <<0x66, 0x4c, 0x61, 0x43, _:bits>> -> Some("audio/flac")
    <<0x4f, 0x67, 0x67, 0x53, _:bits>> -> Some("audio/ogg")
    <<0x52, 0x49, 0x46, 0x46, _:bits>> -> Some("audio/wav")
    <<0x46, 0x4f, 0x52, 0x4d, _:bits>> -> Some("audio/aiff")
    <<_:size(32), 0x66, 0x74, 0x79, 0x70, _:bits>> -> Some("audio/mp4")
    _ -> None
  }
}

pub fn extension(mime: String) {
  case mime {
    "audio/mpeg" -> "mp3"
    "audio/flac" -> "flac"
    "audio/mp4" | "audio/x-m4a" -> "m4a"
    "audio/ogg" -> "ogg"
    "audio/wav" | "audio/x-wav" -> "wav"
    "audio/aiff" | "audio/x-aiff" -> "aiff"
    _ -> "bin"
  }
}

pub fn picture_extension(mime: String) {
  case mime {
    "image/jpeg" -> Some("jpg")
    "image/png" -> Some("png")
    "image/gif" -> Some("gif")
    "image/bmp" -> Some("bmp")
    "image/tiff" -> Some("tiff")
    _ -> None
  }
}

fn opt(key, inner, next) {
  decode.optional_field(key, None, decode.optional(inner), next)
}

fn first(key, next) {
  use values <- opt(key, decode.list(decode.string))
  next(option.then(values, fn(v) { list.first(v) |> option.from_result }))
}

fn position(key, next) {
  opt(
    key,
    decode.field("no", decode.optional(decode.int), decode.success)
      |> decode.map(option.unwrap(_, 0)),
    next,
  )
}

fn text_value() {
  decode.dynamic |> decode.map(js.to_string)
}

pub fn decoder() {
  use common <- decode.field("common", {
    use title <- opt("title", decode.string)
    use artist <- opt("artist", decode.string)
    use album <- opt("album", decode.string)
    use album_artist <- opt("albumartist", decode.string)
    use pictures <- decode.optional_field(
      "picture",
      [],
      decode.list({
        use format <- decode.field("format", decode.string)
        use data <- decode.field("data", decode.dynamic)
        decode.success(Picture(format, data))
      }),
    )
    use gain <- opt(
      "replaygain_track_gain",
      decode.field("dB", decode.optional(decode.float), decode.success),
    )
    use track_number <- position("track")
    use disc_number <- position("disk")
    use genres <- opt("genre", decode.list(decode.string))
    use composer <- first("composer")
    use date <- opt("date", text_value())
    use original_date <- opt("originaldate", text_value())
    use year <- opt("year", decode.int)
    use lyrics <- opt("lyrics", decode.list(decode.dynamic))
    use copyright <- opt("copyright", decode.string)
    use mb_track <- opt("musicbrainz_trackid", decode.string)
    use mb_recording <- opt("musicbrainz_recordingid", decode.string)
    use isrc <- first("isrc")
    use label <- first("label")
    decode.success(Metadata(
      title,
      artist,
      album,
      album_artist,
      0,
      None,
      pictures,
      option.flatten(gain) != None,
      track_number,
      disc_number,
      genres,
      composer,
      option.or(date, original_date),
      year,
      option.map(lyrics, fn(values) {
        list.map(values, js.to_string) |> string.join(",")
      }),
      copyright,
      option.or(mb_track, mb_recording),
      isrc,
      label,
    ))
  })
  use format <- decode.field("format", {
    use duration <- opt("duration", decode.float)
    use sample_rate <- opt("sampleRate", decode.int)
    decode.success(#(duration, sample_rate))
  })
  use native <- decode.optional_field(
    "native",
    [],
    decode.dict(
      decode.string,
      decode.list({
        use id <- decode.field("id", decode.string)
        use value <- decode.field("value", text_value())
        decode.success(#(id, value))
      }),
    )
      |> decode.map(fn(d) { dict.values(d) |> list.flatten }),
  )
  let duration = option.unwrap(format.0, 0.0) *. 1000.0 |> float.round
  let duration = case duration < 1 {
    False -> duration
    True -> {
      list.find(native, fn(t) { t.0 == "TLEN" })
      |> result.try(fn(t) { int.parse(t.1) })
      |> result.unwrap(duration)
    }
  }
  decode.success(Metadata(..common, duration: duration, sample_rate: format.1))
}

fn required(value: Option(String), name: String, max: Int) {
  case option.unwrap(value, "") |> string.trim {
    "" -> [name]
    text ->
      case js.string_length(text) > max {
        True -> [name <> " (too long, max " <> int.to_string(max) <> " chars)"]
        False -> []
      }
  }
}

pub fn album_artist(metadata: Metadata) {
  case option.unwrap(metadata.album_artist, "") |> string.trim {
    "" -> option.unwrap(metadata.artist, "") |> string.trim
    artist -> artist
  }
}

pub fn missing(metadata: Metadata) {
  list.flatten([
    required(metadata.title, "title", 512),
    required(metadata.artist, "artist", 256),
    required(metadata.album, "album", 256),
    case metadata.duration < 1 {
      True -> ["duration"]
      False -> []
    },
    case metadata.pictures {
      [] -> ["album art"]
      _ -> []
    },
    case js.string_length(album_artist(metadata)) > 256 {
      True -> ["albumArtist (too long, max 256 chars)"]
      False -> []
    },
  ])
}

pub fn to_track(metadata: Metadata, album_art: Option(String)) -> Track {
  let title = option.unwrap(metadata.title, "") |> string.trim
  let artist = option.unwrap(metadata.artist, "") |> string.trim
  Track(
    title: title,
    artist: artist,
    artists: None,
    album: option.unwrap(metadata.album, "") |> string.trim,
    album_artist: album_artist(metadata),
    duration: metadata.duration,
    mb_id: metadata.mb_id,
    isrc: option.then(metadata.isrc, fn(v) {
      case string.trim(v) {
        "" -> None
        s -> Some(s)
      }
    }),
    album_art: album_art,
    track_number: metadata.track_number,
    release_date: option.then(metadata.date, fn(d) {
      case string.contains(d, "-") {
        True ->
          js.parse_date_ms(d)
          |> option.map(fn(ms) {
            row.iso8601(row.from_unix_ms(ms)) |> string.slice(0, 10)
          })
        False -> None
      }
    }),
    year: metadata.year,
    disc_number: Some(case metadata.disc_number {
      None | Some(0) -> 1
      Some(n) -> n
    }),
    lyrics: metadata.lyrics,
    composer: metadata.composer,
    copyright_message: metadata.copyright,
    label: metadata.label,
    artist_picture: None,
    spotify_link: None,
    lastfm_link: Some(
      "https://www.last.fm/music/"
      <> uri.percent_encode(artist)
      <> "/_/"
      <> uri.percent_encode(title),
    ),
    youtube_link: None,
    tidal_link: None,
    apple_music_link: None,
    deezer_link: None,
    timestamp: None,
    genres: metadata.genres,
  )
}
