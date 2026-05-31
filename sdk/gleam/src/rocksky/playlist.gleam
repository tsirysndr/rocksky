//// `app.rocksky.playlist.*` — manage and read playlists.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.playlist.createPlaylist`. Add `with_description` for a blurb.
pub fn create(name name: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.playlist.createPlaylist", decode.dynamic)
  |> rocksky.param("name", name)
}

pub fn with_description(req: Request(a), description: String) -> Request(a) {
  rocksky.param(req, "description", description)
}

/// `app.rocksky.playlist.getPlaylist` — fetch a playlist by AT-URI.
pub fn get_playlist(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.playlist.getPlaylist", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.playlist.getPlaylists` — paginated playlist catalogue.
pub fn get_playlists() -> Request(Dynamic) {
  rocksky.query("app.rocksky.playlist.getPlaylists", decode.dynamic)
}

/// `app.rocksky.playlist.removePlaylist`.
pub fn remove(uri uri: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.playlist.removePlaylist", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.playlist.startPlaylist` — begin playback of a playlist.
pub fn start(uri uri: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.playlist.startPlaylist", decode.dynamic)
  |> rocksky.param("uri", uri)
}

pub fn with_shuffle(req: Request(a), shuffle: Bool) -> Request(a) {
  rocksky.bool_param(req, "shuffle", shuffle)
}

pub fn with_position(req: Request(a), position: Int) -> Request(a) {
  rocksky.int_param(req, "position", position)
}

/// `app.rocksky.playlist.insertDirectory`.
pub fn insert_directory(
  uri uri: String,
  directory directory: String,
) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.playlist.insertDirectory", decode.dynamic)
  |> rocksky.param("uri", uri)
  |> rocksky.param("directory", directory)
}

/// `app.rocksky.playlist.insertFiles`.
pub fn insert_files(
  uri uri: String,
  files files: List(String),
) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.playlist.insertFiles", decode.dynamic)
  |> rocksky.param("uri", uri)
  |> rocksky.repeated_param("files", files)
}
