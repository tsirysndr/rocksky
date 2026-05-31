//// `app.rocksky.artist.*` — artist catalogue.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Artist, type Listener}

/// `app.rocksky.artist.getArtist` — fetch an artist by AT-URI.
pub fn get_artist(uri uri: String) -> Request(Artist) {
  rocksky.query("app.rocksky.artist.getArtist", decoders.artist())
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.artist.getArtists` — paginated artist list.
/// Use `rocksky.limit`, `rocksky.offset`, `rocksky.genre`, or
/// `with_names` to refine.
pub fn get_artists() -> Request(List(Artist)) {
  rocksky.query(
    "app.rocksky.artist.getArtists",
    decoders.unwrap("artists", decoders.artist()),
  )
}

/// Filter `get_artists` by a comma-separated `names` parameter.
pub fn with_names(req: Request(a), names: String) -> Request(a) {
  rocksky.param(req, "names", names)
}

/// `app.rocksky.artist.getArtistAlbums` — albums for an artist.
pub fn get_artist_albums(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.artist.getArtistAlbums", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.artist.getArtistTracks` — tracks for an artist.
pub fn get_artist_tracks(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.artist.getArtistTracks", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.artist.getArtistListeners` — top listeners for an artist.
pub fn get_artist_listeners(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.artist.getArtistListeners", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.artist.getArtistRecentListeners` — recent listeners.
pub fn get_artist_recent_listeners(uri uri: String) -> Request(List(Listener)) {
  rocksky.query(
    "app.rocksky.artist.getArtistRecentListeners",
    decoders.unwrap("listeners", decoders.listener()),
  )
  |> rocksky.param("uri", uri)
}
