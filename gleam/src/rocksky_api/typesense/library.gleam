import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/db/row
import rocksky_api/error
import rocksky_api/node/typesense.{type Client}
import rocksky_api/task
import rocksky_api/typesense/retry
import rocksky_api/typesense/schema

pub type LibraryTrackDocument {
  LibraryTrackDocument(
    id: String,
    user_id: String,
    track_id: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    genre: Option(String),
    composer: Option(String),
    year: Option(Int),
    duration: Int,
    album_art: Option(String),
    r2_key: String,
    mime_type: String,
    file_size: Int,
    original_filename: Option(String),
    uploaded_at: Int,
    mb_id: Option(String),
    track_number: Option(Int),
    disc_number: Option(Int),
  )
}

pub fn decoder() {
  use id <- decode.field("id", decode.string)
  use user_id <- decode.field("user_id", decode.string)
  use track_id <- decode.field("track_id", decode.string)
  use title <- decode.field("title", decode.string)
  use artist <- decode.field("artist", decode.string)
  use album <- decode.field("album", decode.string)
  use album_artist <- decode.field("album_artist", decode.string)
  use genre <- decode.optional_field(
    "genre",
    None,
    decode.optional(decode.string),
  )
  use composer <- decode.optional_field(
    "composer",
    None,
    decode.optional(decode.string),
  )
  use year <- decode.optional_field("year", None, decode.optional(decode.int))
  use duration <- decode.field("duration", decode.int)
  use album_art <- decode.optional_field(
    "album_art",
    None,
    decode.optional(decode.string),
  )
  use r2_key <- decode.field("r2_key", decode.string)
  use mime_type <- decode.field("mime_type", decode.string)
  use file_size <- decode.field("file_size", decode.int)
  use original_filename <- decode.optional_field(
    "original_filename",
    None,
    decode.optional(decode.string),
  )
  use uploaded_at <- decode.field("uploaded_at", decode.int)
  use mb_id <- decode.optional_field(
    "mb_id",
    None,
    decode.optional(decode.string),
  )
  use track_number <- decode.optional_field(
    "track_number",
    None,
    decode.optional(decode.int),
  )
  use disc_number <- decode.optional_field(
    "disc_number",
    None,
    decode.optional(decode.int),
  )
  decode.success(LibraryTrackDocument(
    id,
    user_id,
    track_id,
    title,
    artist,
    album,
    album_artist,
    genre,
    composer,
    year,
    duration,
    album_art,
    r2_key,
    mime_type,
    file_size,
    original_filename,
    uploaded_at,
    mb_id,
    track_number,
    disc_number,
  ))
}

pub fn encode(doc: LibraryTrackDocument) {
  json.object(
    list.flatten([
      [#("id", json.string(doc.id))],
      [#("user_id", json.string(doc.user_id))],
      [#("track_id", json.string(doc.track_id))],
      [#("title", json.string(doc.title))],
      [#("artist", json.string(doc.artist))],
      [#("album", json.string(doc.album))],
      [#("album_artist", json.string(doc.album_artist))],
      case doc.genre {
        None -> []
        Some(v) -> [#("genre", json.string(v))]
      },
      case doc.composer {
        None -> []
        Some(v) -> [#("composer", json.string(v))]
      },
      case doc.year {
        None -> []
        Some(v) -> [#("year", json.int(v))]
      },
      [#("duration", json.int(doc.duration))],
      case doc.album_art {
        None -> []
        Some(v) -> [#("album_art", json.string(v))]
      },
      [#("r2_key", json.string(doc.r2_key))],
      [#("mime_type", json.string(doc.mime_type))],
      [#("file_size", json.int(doc.file_size))],
      case doc.original_filename {
        None -> []
        Some(v) -> [#("original_filename", json.string(v))]
      },
      [#("uploaded_at", json.int(doc.uploaded_at))],
      case doc.mb_id {
        None -> []
        Some(v) -> [#("mb_id", json.string(v))]
      },
      case doc.track_number {
        None -> []
        Some(v) -> [#("track_number", json.int(v))]
      },
      case doc.disc_number {
        None -> []
        Some(v) -> [#("disc_number", json.int(v))]
      },
    ]),
  )
}

pub fn index_library_track(client: Client, document: LibraryTrackDocument) {
  retry.run(fn() {
    typesense.upsert_document(client, schema.library_tracks, encode(document))
    |> task.attempt_result
    |> task.map(fn(_) { Nil })
  })
}

pub fn remove_library_track(client: Client, upload_id: String) {
  retry.run(fn() {
    typesense.delete_document(client, schema.library_tracks, upload_id)
    |> task.attempt_result
    |> task.map(fn(_) { Nil })
  })
  |> task.rescue(fn(e) {
    case e {
      error.Js(e) ->
        case typesense.is_not_found(e) {
          True -> task.ok(Nil)
          False -> task.fail(error.Js(e))
        }
      _ -> task.fail(e)
    }
  })
}

pub fn search_library_tracks(
  client: Client,
  query: String,
  user_id: String,
  limit: Int,
  offset: Int,
) {
  let per_page = int.min(limit, 200)
  let params =
    json.object([
      #(
        "q",
        json.string(case query {
          "" -> "*"
          _ -> query
        }),
      ),
      #(
        "query_by",
        json.string("title,artist,album,album_artist,genre,composer"),
      ),
      #("filter_by", json.string("user_id:=" <> user_id)),
      #("per_page", json.int(per_page)),
      #("page", json.int(offset / per_page + 1)),
      #(
        "sort_by",
        json.string(case query {
          "" -> "uploaded_at:desc"
          _ -> "_text_match:desc,uploaded_at:desc"
        }),
      ),
    ])
  use raw <- task.then(
    typesense.search(client, schema.library_tracks, params)
    |> task.attempt_result,
  )
  decode.run(
    raw,
    decode.optional_field(
      "hits",
      [],
      decode.list(decode.field("document", decoder(), decode.success)),
      decode.success,
    ),
  )
  |> result.map_error(error.Decode("Typesense library search", _))
  |> task.from_result
}

/// Public library result, preserving nulls for absent metadata.
pub fn encode_hit(doc: LibraryTrackDocument) {
  json.object([
    #(
      "upload",
      json.object([
        #("id", json.string(doc.id)),
        #("userId", json.string(doc.user_id)),
        #("trackId", json.string(doc.track_id)),
        #("r2Key", json.string(doc.r2_key)),
        #("mimeType", json.string(doc.mime_type)),
        #("fileSize", json.int(doc.file_size)),
        #("originalFilename", json.nullable(doc.original_filename, json.string)),
        #(
          "uploadedAt",
          json.string(row.iso8601(row.from_unix_ms(doc.uploaded_at))),
        ),
      ]),
    ),
    #(
      "track",
      json.object([
        #("id", json.string(doc.track_id)),
        #("title", json.string(doc.title)),
        #("artist", json.string(doc.artist)),
        #("albumArtist", json.string(doc.album_artist)),
        #("album", json.string(doc.album)),
        #("duration", json.int(doc.duration)),
        #("genre", json.nullable(doc.genre, json.string)),
        #("composer", json.nullable(doc.composer, json.string)),
        #("albumArt", json.nullable(doc.album_art, json.string)),
        #("trackNumber", json.nullable(doc.track_number, json.int)),
        #("discNumber", json.nullable(doc.disc_number, json.int)),
        #("mbId", json.nullable(doc.mb_id, json.string)),
        #("year", json.nullable(doc.year, json.int)),
      ]),
    ),
    #("albumReleaseDate", json.null()),
    #("albumYear", json.nullable(doc.year, json.int)),
  ])
}
