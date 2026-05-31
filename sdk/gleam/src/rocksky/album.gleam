//// `app.rocksky.album.*` — album catalogue.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Album}

/// `app.rocksky.album.getAlbum` — fetch an album by AT-URI.
pub fn get_album(uri uri: String) -> Request(Album) {
  rocksky.query("app.rocksky.album.getAlbum", decoders.album())
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.album.getAlbums` — paginated album list.
pub fn get_albums() -> Request(List(Album)) {
  rocksky.query(
    "app.rocksky.album.getAlbums",
    decoders.unwrap("albums", decoders.album()),
  )
}

/// `app.rocksky.album.getAlbumTracks` — tracks for an album.
pub fn get_album_tracks(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.album.getAlbumTracks", decode.dynamic)
  |> rocksky.param("uri", uri)
}
