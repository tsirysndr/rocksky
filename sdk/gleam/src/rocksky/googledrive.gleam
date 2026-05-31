//// `app.rocksky.googledrive.*` — read files from the user's connected Drive.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.googledrive.getFiles` — list files. Use `with_at` for a path.
pub fn get_files() -> Request(Dynamic) {
  rocksky.query("app.rocksky.googledrive.getFiles", decode.dynamic)
}

pub fn with_at(req: Request(a), at: String) -> Request(a) {
  rocksky.param(req, "at", at)
}

/// `app.rocksky.googledrive.getFile` — get a single file by id.
pub fn get_file(file_id file_id: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.googledrive.getFile", decode.dynamic)
  |> rocksky.param("fileId", file_id)
}

/// `app.rocksky.googledrive.downloadFile` — proxy a file download.
pub fn download_file(file_id file_id: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.googledrive.downloadFile", decode.dynamic)
  |> rocksky.param("fileId", file_id)
}
