import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/drizzle/orm.{set}
import rocksky_api/drizzle/schema/discogs_identifiers as di
import rocksky_api/drizzle/schema/discogs_masters as dm
import rocksky_api/drizzle/schema/discogs_release_artists as da
import rocksky_api/drizzle/schema/discogs_release_labels as dl
import rocksky_api/drizzle/schema/discogs_tracks as dt
import rocksky_api/lib/discogs_models as d

pub fn trimmed(value: Option(String)) {
  option.then(value, fn(v) {
    case string.trim(v) {
      "" -> None
      s -> Some(s)
    }
  })
}

pub fn nonzero(value: Option(Int)) {
  case value {
    Some(0) -> None
    _ -> value
  }
}

fn digits(chars: List(String)) {
  list.split_while(chars, fn(c) {
    list.contains(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], c)
  })
}

fn number(chars: List(String)) {
  string.join(chars, "") |> int.parse |> result.unwrap(0)
}

pub fn parse_position(position: String) {
  let chars = string.trim(position) |> string.to_graphemes
  let #(first, rest) = digits(chars)
  case first, rest {
    [_, ..], ["-", ..remaining] | [_, ..], [".", ..remaining] -> {
      let #(second, _) = digits(remaining)
      case second {
        [] -> #(0, 0)
        _ -> #(number(first), number(second))
      }
    }
    [_, ..], [] -> #(0, number(first))
    _, _ ->
      case chars {
        [letter, ..remaining] -> {
          let side =
            string.to_graphemes("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
            |> list.index_map(fn(c, i) { #(c, i) })
            |> list.find(fn(p) { p.0 == string.uppercase(letter) })
            |> result.map(fn(p) { p.1 })
          let #(track, _) = digits(remaining)
          case side, track {
            Ok(side), [_, ..] -> #(side / 2 + 1, number(track))
            _, _ -> #(0, 0)
          }
        }
        [] -> #(0, 0)
      }
  }
}

pub fn parse_duration_ms(duration: String) {
  let value = string.trim(duration)
  let parts = string.split(value, ":")
  case value == "" || list.length(parts) > 3 {
    True -> 0
    False ->
      list.try_fold(parts, 0, fn(seconds, part) {
        let value = string.trim(part)
        let parsed = case value {
          "" -> Ok(0.0)
          _ ->
            int.parse(value)
            |> result.map(int.to_float)
            |> result.or(float.parse(value))
        }
        use n <- result.try(parsed)
        case n >=. 0.0 && float.floor(n) == n {
          True -> Ok(seconds * 60 + float.truncate(n))
          False -> Error(Nil)
        }
      })
      |> result.unwrap(0)
      |> fn(seconds) { seconds * 1000 }
  }
}

fn credit_name(artist: d.DiscogsArtistCredit) {
  option.unwrap(
    case artist.anv {
      Some("") -> None
      _ -> artist.anv
    },
    artist.name,
  )
  |> string.trim
}

pub fn join_artist_credits(artists: List(d.DiscogsArtistCredit)) {
  let artists = list.filter(artists, fn(a) { credit_name(a) != "" })
  let #(value, _) =
    list.fold(artists, #("", None), fn(acc, a) {
      let separator = case acc.1 {
        None -> ""
        Some(None) | Some(Some(",")) -> ", "
        Some(Some(join)) -> " " <> join <> " "
      }
      #(acc.0 <> separator <> credit_name(a), Some(trimmed(a.join)))
    })
  value
}

pub fn to_release_artist_rows(
  release_id: String,
  artists: List(d.DiscogsArtistCredit),
) {
  let table = da.table()
  artists
  |> list.filter(fn(a) { string.trim(a.name) != "" })
  |> list.index_map(fn(a, position) {
    [
      set(da.release_id(table), release_id),
      set(da.artist_id(table), nonzero(a.id)),
      set(da.name(table), string.trim(a.name)),
      set(da.anv(table), trimmed(a.anv)),
      set(da.join_phrase(table), trimmed(a.join)),
      set(da.role(table), trimmed(a.role)),
      set(da.position(table), position),
    ]
  })
}

pub fn to_release_label_rows(release_id: String, release: d.DiscogsRelease) {
  let table = dl.table()
  let rows = fn(entries, kind) {
    entries
    |> list.filter(fn(a: d.DiscogsLabelRef) { string.trim(a.name) != "" })
    |> list.index_map(fn(a, position) {
      [
        set(dl.release_id(table), release_id),
        set(dl.label_id(table), nonzero(a.id)),
        set(dl.name(table), string.trim(a.name)),
        set(dl.catalog_number(table), trimmed(a.catno)),
        set(dl.kind(table), kind),
        set(
          dl.entity_type(table),
          option.or(trimmed(a.entity_type_name), trimmed(a.entity_type)),
        ),
        set(dl.position(table), position),
      ]
    })
  }
  list.append(
    rows(option.unwrap(release.labels, []), "label"),
    rows(option.unwrap(release.companies, []), "company"),
  )
}

pub fn to_identifier_rows(
  release_id: String,
  identifiers: List(d.DiscogsIdentifier),
) {
  let table = di.table()
  identifiers
  |> list.filter(fn(a) { string.trim(a.type_) != "" })
  |> list.index_map(fn(a, position) {
    [
      set(di.release_id(table), release_id),
      set(di.type_(table), string.trim(a.type_)),
      set(di.value(table), trimmed(a.value)),
      set(di.description(table), trimmed(a.description)),
      set(di.position(table), position),
    ]
  })
}

pub fn to_track_rows(
  release_id: String,
  entries: List(d.DiscogsTracklistEntry),
) {
  let table = dt.table()
  entries
  |> list.filter(fn(a) { string.trim(a.title) != "" })
  |> list.index_map(fn(a, index) {
    let #(disc, track) = parse_position(option.unwrap(a.position, ""))
    let ms = parse_duration_ms(option.unwrap(a.duration, ""))
    [
      set(dt.release_id(table), release_id),
      set(dt.position(table), trimmed(a.position)),
      set(dt.type_(table), trimmed(a.type_)),
      set(dt.title(table), string.trim(a.title)),
      set(dt.duration(table), trimmed(a.duration)),
      set(dt.duration_ms(table), nonzero(Some(ms))),
      set(dt.disc_number(table), nonzero(Some(disc))),
      set(dt.track_number(table), nonzero(Some(track))),
      set(dt.idx(table), index),
    ]
  })
}

pub fn to_master_row(master: d.DiscogsMaster) {
  let table = dm.table()
  case master.id == 0 || string.trim(master.title) == "" {
    True -> None
    False ->
      Some([
        set(dm.discogs_id(table), master.id),
        set(dm.title(table), string.trim(master.title)),
        set(
          dm.artist(table),
          trimmed(Some(join_artist_credits(option.unwrap(master.artists, [])))),
        ),
        set(dm.year(table), nonzero(master.year)),
        set(dm.main_release_id(table), nonzero(master.main_release)),
        set(dm.discogs_url(table), trimmed(master.uri)),
        set(dm.genres(table), case master.genres {
          Some([]) -> None
          _ -> master.genres
        }),
        set(dm.styles(table), case master.styles {
          Some([]) -> None
          _ -> master.styles
        }),
      ])
  }
}
