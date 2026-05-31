//// `app.rocksky.dropbox.*` — read files from the user's connected Dropbox.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.dropbox.getFiles` — list files. Use `with_at` for a path.
pub fn get_files() -> Request(Dynamic) {
  rocksky.query("app.rocksky.dropbox.getFiles", decode.dynamic)
}

pub fn with_at(req: Request(a), at: String) -> Request(a) {
  rocksky.param(req, "at", at)
}

/// `app.rocksky.dropbox.getMetadata` — get metadata for a single file.
pub fn get_metadata(path path: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.dropbox.getMetadata", decode.dynamic)
  |> rocksky.param("path", path)
}

/// `app.rocksky.dropbox.getTemporaryLink` — short-lived download link.
pub fn get_temporary_link(path path: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.dropbox.getTemporaryLink", decode.dynamic)
  |> rocksky.param("path", path)
}

/// `app.rocksky.dropbox.downloadFile` — proxy a file download by id.
/// Returns raw bytes; the SDK still types it as `Dynamic`.
pub fn download_file(file_id file_id: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.dropbox.downloadFile", decode.dynamic)
  |> rocksky.param("fileId", file_id)
}
