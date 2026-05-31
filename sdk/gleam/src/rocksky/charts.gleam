//// `app.rocksky.charts.*` — leaderboards and chart data.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Artist, type Song}

/// `app.rocksky.charts.getScrobblesChart` — flexible chart endpoint.
/// Refine with `with_did`, `with_artist_uri`, `with_album_uri`,
/// `with_song_uri`, `rocksky.genre`, `with_from`, `with_to`.
pub fn get_scrobbles_chart() -> Request(Dynamic) {
  rocksky.query("app.rocksky.charts.getScrobblesChart", decode.dynamic)
}

pub fn with_did(req: Request(a), did: String) -> Request(a) {
  rocksky.param(req, "did", did)
}

pub fn with_artist_uri(req: Request(a), uri: String) -> Request(a) {
  rocksky.param(req, "artisturi", uri)
}

pub fn with_album_uri(req: Request(a), uri: String) -> Request(a) {
  rocksky.param(req, "albumuri", uri)
}

pub fn with_song_uri(req: Request(a), uri: String) -> Request(a) {
  rocksky.param(req, "songuri", uri)
}

pub fn with_from(req: Request(a), date: String) -> Request(a) {
  rocksky.param(req, "from", date)
}

pub fn with_to(req: Request(a), date: String) -> Request(a) {
  rocksky.param(req, "to", date)
}

/// `app.rocksky.charts.getTopArtists` — top artists in a time window.
pub fn get_top_artists() -> Request(List(Artist)) {
  rocksky.query(
    "app.rocksky.charts.getTopArtists",
    decoders.unwrap("artists", decoders.artist()),
  )
}

/// `app.rocksky.charts.getTopTracks` — top tracks in a time window.
pub fn get_top_tracks() -> Request(List(Song)) {
  rocksky.query(
    "app.rocksky.charts.getTopTracks",
    decoders.unwrap("tracks", decoders.song()),
  )
}
