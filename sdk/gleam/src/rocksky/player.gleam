//// `app.rocksky.player.*` — control the user's local player.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// Scope a player request to a specific player instance.
pub fn with_player_id(req: Request(a), id: String) -> Request(a) {
  rocksky.param(req, "playerId", id)
}

/// `app.rocksky.player.getCurrentlyPlaying`. Add `with_actor` to fetch another
/// user's player state if you have permission.
pub fn get_currently_playing() -> Request(Dynamic) {
  rocksky.query("app.rocksky.player.getCurrentlyPlaying", decode.dynamic)
}

pub fn with_actor(req: Request(a), actor: String) -> Request(a) {
  rocksky.param(req, "actor", actor)
}

/// `app.rocksky.player.getPlaybackQueue`.
pub fn get_queue() -> Request(Dynamic) {
  rocksky.query("app.rocksky.player.getPlaybackQueue", decode.dynamic)
}

/// `app.rocksky.player.play`.
pub fn play() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.play", decode.dynamic)
}

/// `app.rocksky.player.pause`.
pub fn pause() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.pause", decode.dynamic)
}

/// `app.rocksky.player.next`.
pub fn next() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.next", decode.dynamic)
}

/// `app.rocksky.player.previous`.
pub fn previous() -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.previous", decode.dynamic)
}

/// `app.rocksky.player.seek` — `position` is in milliseconds.
pub fn seek(position position: Int) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.seek", decode.dynamic)
  |> rocksky.int_param("position", position)
}

/// `app.rocksky.player.playFile` — play a single file by id.
pub fn play_file(file_id file_id: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.playFile", decode.dynamic)
  |> rocksky.param("fileId", file_id)
}

/// `app.rocksky.player.playDirectory` — play a directory of files.
pub fn play_directory(directory_id directory_id: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.playDirectory", decode.dynamic)
  |> rocksky.param("directoryId", directory_id)
}

pub fn with_shuffle(req: Request(a), shuffle: Bool) -> Request(a) {
  rocksky.bool_param(req, "shuffle", shuffle)
}

pub fn with_recurse(req: Request(a), recurse: Bool) -> Request(a) {
  rocksky.bool_param(req, "recurse", recurse)
}

pub fn with_position(req: Request(a), position: Int) -> Request(a) {
  rocksky.int_param(req, "position", position)
}

/// `app.rocksky.player.addItemsToQueue`.
pub fn add_items_to_queue(items items: List(String)) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.player.addItemsToQueue", decode.dynamic)
  |> rocksky.repeated_param("items", items)
}
