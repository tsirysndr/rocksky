import gleam/dict.{type Dict}
import gleam/dynamic.{type Dynamic}
import gleam/int
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/imports/csv
import rocksky_cli/node
import rocksky_cli/value

pub type Parsed {
  Parsed(
    format: String,
    scrobbles: List(Dynamic),
    files: List(String),
    skipped: Dict(String, Int),
  )
}

pub fn detect(file: String, head: String) -> Result(String, String) {
  case string.ends_with(string.lowercase(file), ".csv") {
    True -> detect_csv(head)
    False ->
      case
        string.ends_with(string.lowercase(file), ".json")
        || string.starts_with(string.trim_start(head), "[")
        || string.starts_with(string.trim_start(head), "{")
      {
        True ->
          case
            string.contains(head, "master_metadata_track_name")
            || string.contains(head, "spotify_track_uri")
            || {
              string.contains(head, "\"ts\"")
              && string.contains(head, "\"ms_played\"")
            }
          {
            True -> Ok("spotify")
            False -> Ok("lastfm")
          }
        False -> detect_csv(head)
      }
  }
}

fn detect_csv(head: String) -> Result(String, String) {
  let line =
    string.split(head, "\n")
    |> list.first
    |> result.unwrap("")
    |> string.lowercase
  case
    string.contains(line, "uts")
    || { string.contains(line, "track") && string.contains(line, "artist") }
  {
    True -> Ok("lastfm")
    False ->
      case
        string.contains(line, "master_metadata_track_name")
        || string.contains(line, "spotify_track_uri")
      {
        True -> Ok("spotify")
        False ->
          Error(
            "Could not autodetect import format. Pass --format spotify|lastfm.",
          )
      }
  }
}

pub fn parse(
  target: String,
  force: String,
  min_seconds: Int,
) -> Result(Parsed, String) {
  case node.is_directory(target) {
    True -> {
      let files =
        node.files(target)
        |> list.filter(fn(path) {
          let filename =
            string.split(path, "/")
            |> list.last
            |> result.unwrap("")
            |> string.lowercase
          string.starts_with(filename, "streaming_history_audio_")
          && string.ends_with(filename, ".json")
        })
      case files {
        [] ->
          Error(
            "No Spotify Streaming_History_Audio_*.json files found in "
            <> target,
          )
        _ -> spotify_files(files, min_seconds)
      }
    }
    False -> {
      use raw <- result.try(node.read(target))
      use format <- result.try(case force {
        "" -> detect(target, raw)
        _ -> Ok(force)
      })
      case format {
        "spotify" -> spotify_files([target], min_seconds)
        "lastfm" -> {
          let trimmed = string.trim_start(raw)
          case
            string.ends_with(string.lowercase(target), ".json")
            || string.starts_with(trimmed, "[")
            || string.starts_with(trimmed, "{")
          {
            True -> {
              use data <- result.try(value.parse(raw))
              let rows = case value.items(data) {
                [] ->
                  first_items([
                    value.at(data, ["recenttracks", "track"]),
                    value.field(data, "track"),
                    value.field(data, "scrobbles"),
                  ])
                items -> items
              }
              Ok(finalize(
                Parsed("lastfm", [], [target], dict.new()),
                list.map(rows, lastfm),
              ))
            }
            False -> lastfm_csv(target, raw)
          }
        }
        _ -> Error("Unsupported import format: " <> format)
      }
    }
  }
}

fn first_items(values: List(Dynamic)) -> List(Dynamic) {
  case values {
    [] -> []
    [v, ..rest] ->
      case value.is_null(v) {
        True -> first_items(rest)
        False -> value.items(v)
      }
  }
}

fn spotify_files(files: List(String), minimum: Int) -> Result(Parsed, String) {
  use rows <- result.try(
    list.try_fold(files, [], fn(acc, file) {
      use raw <- result.try(node.read(file))
      use data <- result.try(value.parse(raw))
      case string.starts_with(string.trim_start(raw), "[") {
        False -> Error("Expected a JSON array in " <> file)
        True ->
          Ok(list.append(
            acc,
            list.map(value.items(data), fn(row) { spotify(row, minimum) }),
          ))
      }
    }),
  )
  Ok(finalize(Parsed("spotify", [], files, dict.new()), rows))
}

fn make(
  title: String,
  artist: String,
  album: String,
  mbid: String,
  timestamp: Int,
  source: String,
  played: Int,
) -> Dynamic {
  let fields = [
    #("title", json.string(title)),
    #("artist", json.string(artist)),
    #("timestamp", json.int(timestamp)),
    #("source", json.string(source)),
  ]
  let fields = case album {
    "" -> fields
    _ -> [#("album", json.string(album)), ..fields]
  }
  let fields = case mbid {
    "" -> fields
    _ -> [#("mbId", json.string(mbid)), ..fields]
  }
  let fields = case played {
    -1 -> fields
    _ -> [#("msPlayed", json.int(played)), ..fields]
  }
  fields |> json.object |> json.to_string |> value.from_json
}

fn spotify(row: Dynamic, minimum: Int) -> Result(Dynamic, String) {
  let title = value.string(row, "master_metadata_track_name")
  let artist = value.string(row, "master_metadata_album_artist_name")
  let played = value.integer(row, "ms_played", 0)
  case title == "" || artist == "" {
    True -> Error("not-a-track")
    False ->
      case played < int.max(0, minimum) * 1000 {
        True -> Error("played-under-" <> int.to_string(minimum) <> "s")
        False -> {
          use timestamp <- result.try(
            node.timestamp(value.string(row, "ts"))
            |> result.map_error(fn(_) { "bad-timestamp" }),
          )
          Ok(make(
            title,
            artist,
            value.string(row, "master_metadata_album_album_name"),
            "",
            timestamp,
            "spotify",
            played,
          ))
        }
      }
  }
}

fn text(data: Dynamic) -> String {
  case value.text(data) {
    "" ->
      case value.string(data, "#text") {
        "" -> value.string(data, "name")
        name -> name
      }
    text -> text
  }
}

fn first(values: List(Dynamic)) -> Dynamic {
  case values {
    [] -> value.null()
    [v, ..rest] ->
      case value.is_null(v) {
        True -> first(rest)
        False -> v
      }
  }
}

fn lastfm(row: Dynamic) -> Result(Dynamic, String) {
  let title =
    first([
      value.field(row, "name"),
      value.field(row, "track"),
      value.field(row, "title"),
    ])
    |> text
    |> string.trim
  let artist = value.field(row, "artist") |> text |> string.trim
  let date =
    first([
      value.at(row, ["date", "uts"]),
      value.field(row, "date"),
      value.field(row, "uts"),
      value.field(row, "timestamp"),
    ])
    |> value.text
    |> int.parse
    |> result.unwrap(0)
  case value.at(row, ["@attr", "nowplaying"]) |> value.text == "true" {
    True -> Error("now-playing")
    False ->
      case title == "" || artist == "" {
        True -> Error("missing-title-or-artist")
        False ->
          case date <= 0 {
            True -> Error("bad-timestamp")
            False ->
              Ok(make(
                title,
                artist,
                text(value.field(row, "album")) |> string.trim,
                first([value.field(row, "mbid"), value.field(row, "track_mbid")])
                  |> value.text
                  |> string.trim,
                date,
                "lastfm",
                -1,
              ))
          }
      }
  }
}

fn lastfm_csv(file: String, raw: String) -> Result(Parsed, String) {
  case csv.parse(raw) {
    [] -> Ok(Parsed("lastfm", [], [file], dict.new()))
    [header, ..rows] -> {
      let header =
        list.map(header, fn(h) { h |> string.trim |> string.lowercase })
      case list.contains(header, "track") && list.contains(header, "artist") {
        False ->
          Error(
            "Unrecognized Last.fm CSV header in "
            <> file
            <> ": "
            <> string.join(header, ","),
          )
        True -> {
          let parsed =
            list.map(rows, fn(row) {
              let pairs =
                list.zip(header, row)
                |> list.map(fn(p) { #(p.0, json.string(p.1)) })
              lastfm(pairs |> json.object |> json.to_string |> value.from_json)
            })
          Ok(finalize(Parsed("lastfm", [], [file], dict.new()), parsed))
        }
      }
    }
  }
}

fn bump(skipped: Dict(String, Int), reason: String) -> Dict(String, Int) {
  dict.insert(
    skipped,
    reason,
    { dict.get(skipped, reason) |> result.unwrap(0) } + 1,
  )
}

fn finalize(parsed: Parsed, rows: List(Result(Dynamic, String))) -> Parsed {
  let #(tracks, skipped) =
    list.fold(rows, #([], parsed.skipped), fn(acc, row) {
      case row {
        Ok(track) -> #([track, ..acc.0], acc.1)
        Error(reason) -> #(acc.0, bump(acc.1, reason))
      }
    })
  let tracks =
    list.reverse(tracks)
    |> list.sort(fn(a, b) {
      int.compare(
        value.integer(a, "timestamp", 0),
        value.integer(b, "timestamp", 0),
      )
    })
  let #(tracks, skipped, _) =
    list.fold(tracks, #([], skipped, dict.new()), fn(acc, track) {
      let key =
        int.to_string(value.integer(track, "timestamp", 0))
        <> "|"
        <> string.lowercase(value.string(track, "title"))
        <> "|"
        <> string.lowercase(value.string(track, "artist"))
      case dict.has_key(acc.2, key) {
        True -> #(acc.0, bump(acc.1, "duplicate-in-file"), acc.2)
        False -> #([track, ..acc.0], acc.1, dict.insert(acc.2, key, True))
      }
    })
  Parsed(..parsed, scrobbles: list.reverse(tracks), skipped: skipped)
}
