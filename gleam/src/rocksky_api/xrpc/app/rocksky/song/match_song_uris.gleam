import gleam/float
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, from, one, where}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lib/matching.{type Candidate}
import rocksky_api/node/crypto
import rocksky_api/schema/albums
import rocksky_api/schema/artists
import rocksky_api/schema/tracks
import rocksky_api/task

pub type Identity {
  Identity(
    record: Option(tracks.Track),
    album: Option(albums.Album),
    artist: Option(artists.Artist),
    uri: Option(String),
    album_uri: Option(String),
    artist_uri: Option(String),
  )
}

fn hash(value: String) {
  crypto.sha256_hex(string.lowercase(value))
}

fn same(a: String, b: String) {
  string.lowercase(a) == string.lowercase(b)
}

fn no_error(task) {
  task |> task.rescue(fn(_) { task.ok(None) })
}

fn conflicting(
  a: Option(String),
  b: Option(String),
  normalize: fn(String) -> String,
) {
  case a, b {
    Some(a), Some(b) if a != "" && b != "" -> normalize(a) != normalize(b)
    _, _ -> False
  }
}

fn normal_isrc(value: String) {
  value |> string.replace("-", "") |> string.uppercase
}

pub fn catalog_identity(
  ctx: Context,
  candidate: Candidate,
  selected: Option(tracks.Track),
) {
  let tracks = t.table()
  let albums = al.table()
  let artists = ar.table()
  let artist = string.join(candidate.artists, ", ")
  let album_artist =
    option.unwrap(
      candidate.album_artist,
      candidate.artists |> list.first |> option.from_result |> option.unwrap(""),
    )
  let album = option.unwrap(candidate.album, "")
  use rows <- task.map(task.all3(
    case selected, album {
      Some(_), _ -> task.ok(selected)
      None, "" -> task.ok(None)
      _, _ ->
        from(tracks)
        |> where(eq(
          t.sha256(tracks),
          hash(candidate.title <> " - " <> artist <> " - " <> album),
        ))
        |> one(ctx.read_db)
        |> no_error
    },
    case album {
      "" -> task.ok(None)
      _ ->
        from(albums)
        |> where(eq(al.sha256(albums), hash(album <> " - " <> album_artist)))
        |> one(ctx.read_db)
        |> no_error
    },
    from(artists)
      |> where(eq(ar.sha256(artists), hash(album_artist)))
      |> one(ctx.read_db)
      |> no_error,
  ))
  let record = case rows.0, selected {
    Some(row), None -> {
      let duration_conflict = case candidate.duration_ms {
        Some(ms) if ms != 0.0 && row.duration > 1 ->
          float.absolute_value(ms -. int.to_float(row.duration))
          >. float.max(5000.0, ms /. 50.0)
        _ -> False
      }
      case
        same(row.title, candidate.title)
        && same(row.artist, artist)
        && same(row.album, album)
        && !conflicting(candidate.identifiers.isrc, row.isrc, normal_isrc)
        && !conflicting(
          candidate.identifiers.recording,
          row.mb_id,
          string.lowercase,
        )
        && !duration_conflict
      {
        True -> Some(row)
        False -> None
      }
    }
    row, _ -> row
  }
  let album_record =
    option.then(rows.1, fn(row) {
      case same(row.title, album) && same(row.artist, album_artist) {
        True -> Some(row)
        False -> None
      }
    })
  let artist_record =
    option.then(rows.2, fn(row) {
      case same(row.name, album_artist) {
        True -> Some(row)
        False -> None
      }
    })
  let same_album =
    option.unwrap(
      option.map(record, fn(row) {
        same(row.album, album) && same(row.album_artist, album_artist)
      }),
      False,
    )
  Identity(
    record,
    album_record,
    artist_record,
    option.then(record, fn(row) { row.uri }),
    option.or(option.then(album_record, fn(row) { row.uri }), case same_album {
      True -> option.then(record, fn(row) { row.album_uri })
      False -> None
    }),
    option.or(
      option.then(artist_record, fn(row) { row.uri }),
      option.then(record, fn(row) {
        case same(row.album_artist, album_artist) {
          True -> row.artist_uri
          False -> None
        }
      }),
    ),
  )
}
