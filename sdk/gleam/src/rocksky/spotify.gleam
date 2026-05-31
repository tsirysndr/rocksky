//// `app.rocksky.spotify.*` — control the user's connected Spotify session.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.spotify.getCurrentlyPlaying`. Add `with_actor` to scope to
/// another user.
pub fn get_currently_playing() -> Request(Dynamic) {
  rocksky.query("app.rocksky.spotify.getCurrentlyPlaying", decode.dynamic)
}

pub fn with_actor(req: Request(a), actor: String) -> Request(a) {
  rocksky.param(req, "actor", actor)
}

/// `app.rocksky.spotify.play`.
pub fn play() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.spotify.play", decode.dynamic)
}

/// `app.rocksky.spotify.pause`.
pub fn pause() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.spotify.pause", decode.dynamic)
}

/// `app.rocksky.spotify.next`.
pub fn next() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.spotify.next", decode.dynamic)
}

/// `app.rocksky.spotify.previous`.
pub fn previous() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.spotify.previous", decode.dynamic)
}

/// `app.rocksky.spotify.seek` — `position` is in milliseconds.
pub fn seek(position position: Int) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.spotify.seek", decode.dynamic)
  |> rocksky.int_param("position", position)
}
