import gleam/json
import gleam/list
import rocksky_api/error
import rocksky_api/node/typesense.{type Client}
import rocksky_api/task

pub const library_tracks = "library_tracks"

pub const albums = "albums"

pub const artists = "artists"

pub const tracks = "tracks"

pub const users = "users"

pub const playlists = "playlists"

fn field(name: String, kind: String, optional: Bool, facet: Bool, index: Bool) {
  json.object([
    #("name", json.string(name)),
    #("type", json.string(kind)),
    #("optional", json.bool(optional)),
    #("facet", json.bool(facet)),
    #("index", json.bool(index)),
  ])
}

pub fn library_schema() {
  json.object([
    #("name", json.string(library_tracks)),
    #("default_sorting_field", json.string("uploaded_at")),
    #(
      "fields",
      json.array(
        [
          field("id", "string", False, False, True),
          field("user_id", "string", False, True, True),
          field("track_id", "string", False, False, False),
          field("title", "string", False, False, True),
          field("artist", "string", False, False, True),
          field("album", "string", False, False, True),
          field("album_artist", "string", False, False, True),
          field("genre", "string", True, False, True),
          field("composer", "string", True, False, True),
          field("year", "int32", True, False, True),
          field("duration", "int32", False, False, True),
          field("album_art", "string", True, False, False),
          field("r2_key", "string", False, False, False),
          field("mime_type", "string", False, False, False),
          field("file_size", "int32", False, False, False),
          field("original_filename", "string", True, False, False),
          field("uploaded_at", "int64", False, False, True),
          field("mb_id", "string", True, False, True),
          field("track_number", "int32", True, False, True),
          field("disc_number", "int32", True, False, True),
        ],
        fn(x) { x },
      ),
    ),
  ])
}

fn search_schema(name: String, fields: List(json.Json)) {
  #(
    name,
    json.object([
      #("name", json.string(name)),
      #("enable_nested_fields", json.bool(True)),
      #(
        "fields",
        json.array(
          [
            field("id", "string", False, False, True),
            ..list.append(fields, [field(".*", "auto", False, False, True)])
          ],
          fn(x) { x },
        ),
      ),
    ]),
  )
}

pub fn search_schemas() {
  [
    search_schema("albums", [
      field("title", "string", True, False, True),
      field("artist", "string", True, False, True),
      field("year", "int32", True, True, True),
    ]),
    search_schema("artists", [
      field("name", "string", True, False, True),
      field("biography", "string", True, False, True),
      field("genres", "string[]", True, True, True),
      field("bornIn", "string", True, False, True),
    ]),
    search_schema("tracks", [
      field("title", "string", True, False, True),
      field("artist", "string", True, False, True),
      field("albumArtist", "string", True, False, True),
      field("album", "string", True, False, True),
      field("genre", "string", True, True, True),
      field("composer", "string", True, False, True),
    ]),
    search_schema("users", [
      field("handle", "string", True, False, True),
      field("displayName", "string", True, False, True),
    ]),
    search_schema("playlists", [
      field("name", "string", True, False, True),
      field("description", "string", True, False, True),
    ]),
  ]
}

fn ensure(client: Client, name: String, schema: json.Json) {
  typesense.retrieve_collection(client, name)
  |> task.attempt_result
  |> task.rescue(fn(_) {
    typesense.create_collection(client, schema) |> task.attempt_result
  })
  |> task.map(fn(_) { Nil })
}

pub fn ensure_collection(client: Client) {
  ensure(client, library_tracks, library_schema())
}

pub fn ensure_search_collections(client: Client) {
  task.each_(search_schemas(), fn(s) { ensure(client, s.0, s.1) })
}

pub fn recreate_search_collections(client: Client) {
  task.each_(search_schemas(), fn(s) {
    use _ <- task.then(
      typesense.delete_collection(client, s.0)
      |> task.attempt_result
      |> task.map(fn(_) { Nil })
      |> task.rescue(fn(e) {
        case e {
          error.Js(e) ->
            case typesense.is_not_found(e) {
              True -> task.ok(Nil)
              False -> task.fail(error.Js(e))
            }
          _ -> task.fail(e)
        }
      }),
    )
    typesense.create_collection(client, s.1)
    |> task.attempt_result
    |> task.map(fn(_) { Nil })
  })
}
