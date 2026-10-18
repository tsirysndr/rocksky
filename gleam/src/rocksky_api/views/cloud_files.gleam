import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/db/row

pub type Directory {
  Directory(
    id: String,
    name: String,
    path: String,
    parent_id: Option(String),
    provider_id: String,
    file_id: String,
    version: Option(String),
    created_at: Timestamp,
    updated_at: Timestamp,
  )
}

pub type File {
  File(
    id: String,
    name: String,
    file_id: String,
    directory_id: Option(String),
    track_id: String,
    created_at: Timestamp,
    updated_at: Timestamp,
  )
}

pub type View {
  View(
    directory: Option(Directory),
    parent: Option(Directory),
    directories: List(Directory),
    files: List(File),
    google: Bool,
  )
}

fn directory(value: Option(Directory), google: Bool, parent: Bool) {
  case value {
    None -> json.object([])
    Some(v) ->
      json.object([
        #("id", json.string(v.id)),
        #("name", json.string(v.name)),
        #("path", json.string(v.path)),
        #("fileId", json.string(v.file_id)),
        #("parentId", json.nullable(v.parent_id, json.string)),
        #(
          case google {
            True -> "googleDriveId"
            False -> "dropboxId"
          },
          json.string(v.provider_id),
        ),
        ..case google && parent {
          False -> []
          True -> [#("xataVersion", json.nullable(v.version, json.string))]
        }
      ])
  }
}

pub fn fallback() {
  json.object([
    #("files", json.array([], json.string)),
    #("directories", json.array([], json.string)),
  ])
}

pub fn encode(view: View) {
  json.object([
    #("directory", directory(view.directory, view.google, False)),
    #("parentDirectory", directory(view.parent, view.google, True)),
    #(
      "directories",
      json.array(view.directories, fn(v) {
        json.object([
          #("id", json.string(v.id)),
          #("name", json.string(v.name)),
          #("fileId", json.string(v.file_id)),
          #("path", json.string(v.path)),
          #("parentId", json.nullable(v.parent_id, json.string)),
          #("createdAt", json.string(row.iso8601(v.created_at))),
          #("updatedAt", json.string(row.iso8601(v.updated_at))),
        ])
      }),
    ),
    #(
      "files",
      json.array(view.files, fn(v) {
        json.object([
          #("id", json.string(v.id)),
          #("name", json.string(v.name)),
          #("fileId", json.string(v.file_id)),
          #("directoryId", json.nullable(v.directory_id, json.string)),
          #("trackId", json.string(v.track_id)),
          #("createdAt", json.string(row.iso8601(v.created_at))),
          #("updatedAt", json.string(row.iso8601(v.updated_at))),
        ])
      }),
    ),
  ])
}

pub fn first_parent(rows: List(#(a, #(Option(Directory), Option(Directory))))) {
  case rows {
    [r, ..] -> r.1
    _ -> #(None, None)
  }
}
