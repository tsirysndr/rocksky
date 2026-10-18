import gleam/dict
import gleam/dynamic
import gleam/dynamic/decode
import gleam/float
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/lib/track.{type Track, Track}
import rocksky_api/node/js
import rocksky_api/node/pg

pub fn csv_line(line: String) {
  csv_chars(string.to_graphemes(line), False, [], [])
}

fn csv_chars(chars, quoted, current, fields) {
  case chars {
    [] ->
      list.reverse([
        string.join(list.reverse(current), "") |> string.trim,
        ..fields
      ])
    ["\"", "\"", ..rest] if quoted ->
      csv_chars(rest, quoted, ["\"", ..current], fields)
    ["\"", ..rest] -> csv_chars(rest, !quoted, current, fields)
    [",", ..rest] if !quoted ->
      csv_chars(rest, quoted, [], [
        string.join(list.reverse(current), "") |> string.trim,
        ..fields
      ])
    [char, ..rest] -> csv_chars(rest, quoted, [char, ..current], fields)
  }
}

fn at(fields, index) {
  case index < 0 {
    True -> ""
    False -> fields |> list.drop(index) |> list.first |> result.unwrap("")
  }
}

fn index(fields, name) {
  list.index_fold(fields, -1, fn(found, field, i) {
    case found == -1 && field == name {
      True -> i
      False -> found
    }
  })
}

fn nonempty(value: String) {
  case value {
    "" -> None
    value -> Some(value)
  }
}

pub fn lastfm_csv(text: String) -> List(Track) {
  let text = case string.starts_with(text, "\u{feff}") {
    True -> string.drop_start(text, 1)
    False -> text
  }
  let lines = string.split(text, "\n")
  let first = list.first(lines) |> result.unwrap("") |> string.trim |> csv_line
  let #(lines, columns) = case string.lowercase(at(first, 0)) == "uts" {
    True -> #(
      list.drop(lines, 1),
      #(
        index(first, "uts"),
        index(first, "artist"),
        index(first, "album"),
        index(first, "track"),
        index(first, "track_mbid"),
      ),
    )
    False -> #(lines, #(0, 2, 4, 6, 7))
  }
  list.filter_map(lines, fn(line) {
    let fields = csv_line(string.trim(line))
    let artist = at(fields, columns.1)
    let title = at(fields, columns.3)
    let album = at(fields, columns.2)
    case
      list.length(fields) >= 7,
      artist,
      title,
      int.parse(at(fields, columns.0))
    {
      True, artist, title, Ok(time)
        if artist != "" && title != "" && time != 0
      ->
        Ok(
          Track(
            ..track.new(
              title,
              artist,
              case album {
                "" -> "Unknown Album"
                _ -> album
              },
              0,
            ),
            timestamp: Some(time),
            mb_id: nonempty(at(fields, columns.4)),
          ),
        )
      _, _, _, _ -> Error(Nil)
    }
  })
}

fn optional(fields, name, decoder) {
  dict.get(fields, name)
  |> option.from_result
  |> option.then(fn(v) { decode.run(v, decoder) |> option.from_result })
}

fn string_field(fields, name) {
  option.unwrap(optional(fields, name, decode.string), "")
}

pub fn spotify_json(text: String) {
  use input <- result.map(json.parse(text, decode.dynamic))
  case
    decode.run(input, decode.list(decode.dict(decode.string, decode.dynamic)))
  {
    Error(_) -> []
    Ok(entries) ->
      list.filter_map(entries, fn(fields) {
        let extended = dict.has_key(fields, "master_metadata_track_name")
        let title =
          string_field(fields, case extended {
            True -> "master_metadata_track_name"
            False -> "trackName"
          })
        let artist =
          string_field(fields, case extended {
            True -> "master_metadata_album_artist_name"
            False -> "artistName"
          })
        let ms =
          option.unwrap(
            optional(
              fields,
              case extended {
                True -> "ms_played"
                False -> "msPlayed"
              },
              decode.float,
            ),
            0.0,
          )
        let time =
          optional(
            fields,
            case extended {
              True -> "ts"
              False -> "endTime"
            },
            decode.string,
          )
        let time = case time {
          None -> Some(js.now_ms())
          Some(t) ->
            pg.to_ms(
              dynamic.string(case extended {
                True -> t
                False -> string.replace(t, " ", "T") <> ":00Z"
              }),
            )
        }
        case title != "" && artist != "" && ms >=. 30_000.0, time {
          True, Some(time) -> {
            let album = string_field(fields, "master_metadata_album_album_name")
            let spotify_id =
              string_field(fields, "spotify_track_uri")
              |> string.split(":")
              |> list.last
              |> result.unwrap("")
            Ok(
              Track(
                ..track.new(
                  title,
                  artist,
                  case album {
                    "" -> "Unknown Album"
                    _ -> album
                  },
                  float.truncate(ms),
                ),
                timestamp: Some(time / 1000),
                spotify_link: case extended, spotify_id {
                  True, id if id != "" ->
                    Some("https://open.spotify.com/track/" <> id)
                  _, _ -> None
                },
              ),
            )
          }
          _, _ -> Error(Nil)
        }
      })
  }
}
