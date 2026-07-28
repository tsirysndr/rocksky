//// A Rocksky **remote controller** over the remote-control WebSocket (see
//// `remote-ws/PROTOCOL.md`) — the other half of `rocksky/remote_player`. It
//// lists the user's players, observes what each is playing (now-playing /
//// status / queue), picks the primary device, and sends commands
//// (play / pause / next / previous / seek / queue actions / enqueue). Heartbeat,
//// reconnect, and the register handshake are handled by the native core.
////
//// Like the player it follows a **poll model**: build a controller with
//// [connect](#connect), then call [next_event](#next_event) in a loop on a
//// background process — it blocks until the next update (or returns `Ok(None)`
//// once disconnected):
////
////   let controller = remote_controller.connect(token, "My Controller")
////   case remote_controller.next_event(controller) {
////     Ok(Some(remote_controller.Devices(_, devices))) -> render(devices)
////     Ok(Some(remote_controller.NowPlayingEvent(id, _, track))) -> show(id, track)
////     _ -> Nil
////   }
////   // …then drive a device (or pass None to broadcast to all):
////   remote_controller.set_primary(controller, device_id)
////   remote_controller.pause(controller, Some(device_id))
////   remote_controller.seek(controller, Some(device_id), 42_000)
////
//// The shared value types ([NowPlaying](../remote_player.html#NowPlaying),
//// [QueueItem](../remote_player.html#QueueItem),
//// [Status](../remote_player.html#Status)) and the `{ok|error}` envelope helpers
//// live in `rocksky/remote_player` and are reused here.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/option.{type Option, None}
import rocksky/remote_player.{
  type NowPlaying, type QueueItem, type RemoteError, type Status, decode_ack,
  decode_envelope, now_playing_decoder, queue_item_decoder, queue_items_to_json,
  status_decoder,
}

/// An opaque handle to a connected controller — a NIF resource freed by the
/// BEAM GC. Build it with [connect](#connect).
pub opaque type RemoteController {
  RemoteController(handle: Dynamic)
}

/// A player device visible to the controller.
pub type Device {
  Device(
    device_id: String,
    name: String,
    now_playing: Option(NowPlaying),
    queue_index: Int,
    queue: List(QueueItem),
  )
}

/// An update pushed to the controller, as decoded from [next_event](#next_event).
pub type Event {
  /// The full device snapshot (on connect + whenever it changes).
  Devices(primary_device: Option(String), devices: List(Device))
  DeviceRegistered(device_id: String, name: String)
  DeviceUnregistered(device_id: String)
  PrimaryChanged(device_id: String)
  NowPlayingEvent(device_id: String, device_name: String, track: NowPlaying)
  StatusEvent(device_id: String, device_name: String, status: Status)
  QueueEvent(
    device_id: String,
    device_name: String,
    index: Int,
    queue: List(QueueItem),
  )
}

// ---- FFI (rocksky_nif) ----------------------------------------------------

@external(erlang, "rocksky_nif", "remote_controller_connect")
fn controller_connect_ffi(token: String, name: String, url: String) -> Dynamic

@external(erlang, "rocksky_nif", "remote_controller_next_event")
fn controller_next_event_ffi(handle: Dynamic) -> String

@external(erlang, "rocksky_nif", "remote_controller_set_primary")
fn controller_set_primary_ffi(handle: Dynamic, device_id: String) -> String

@external(erlang, "rocksky_nif", "remote_controller_command")
fn controller_command_ffi(
  handle: Dynamic,
  action: String,
  target: String,
) -> String

@external(erlang, "rocksky_nif", "remote_controller_seek")
fn controller_seek_ffi(
  handle: Dynamic,
  target: String,
  position_ms: Int,
) -> String

@external(erlang, "rocksky_nif", "remote_controller_queue_jump")
fn controller_queue_jump_ffi(
  handle: Dynamic,
  target: String,
  index: Int,
) -> String

@external(erlang, "rocksky_nif", "remote_controller_queue_remove")
fn controller_queue_remove_ffi(
  handle: Dynamic,
  target: String,
  index: Int,
) -> String

@external(erlang, "rocksky_nif", "remote_controller_enqueue")
fn controller_enqueue_ffi(
  handle: Dynamic,
  target: String,
  tracks_json: String,
  mode: String,
  shuffle: Bool,
  start_index: Int,
) -> String

@external(erlang, "rocksky_nif", "remote_controller_disconnect")
fn controller_disconnect_ffi(handle: Dynamic) -> String

// ---- lifecycle ------------------------------------------------------------

/// Connect and register a controller in the background. `token` is a Rocksky
/// access token; `name` is a registration label (controllers are hidden from
/// device lists).
pub fn connect(token: String, name: String) -> RemoteController {
  RemoteController(handle: controller_connect_ffi(token, name, ""))
}

/// [connect](#connect) against a custom WebSocket endpoint.
pub fn connect_at(
  token: String,
  name: String,
  url: String,
) -> RemoteController {
  RemoteController(handle: controller_connect_ffi(token, name, url))
}

/// Disconnect and stop the background task.
pub fn disconnect(controller: RemoteController) -> Result(Nil, RemoteError) {
  decode_ack(controller_disconnect_ffi(controller.handle))
}

// ---- poll -----------------------------------------------------------------

/// Block until the next update. Returns `Ok(None)` once the controller is
/// disconnected — the loop should stop then.
pub fn next_event(
  controller: RemoteController,
) -> Result(Option(Event), RemoteError) {
  decode_envelope(
    controller_next_event_ffi(controller.handle),
    decode.optional(event_decoder()),
  )
}

// ---- controls -------------------------------------------------------------

/// Choose the primary (scrobble / profile) device.
pub fn set_primary(
  controller: RemoteController,
  device_id: String,
) -> Result(Nil, RemoteError) {
  decode_ack(controller_set_primary_ffi(controller.handle, device_id))
}

/// `play`. Pass `Some(device_id)` to target one device, or `None` to broadcast
/// to all of them.
pub fn play(
  controller: RemoteController,
  target: Option(String),
) -> Result(Nil, RemoteError) {
  command(controller, "play", target)
}

/// `pause` (see [play](#play) for `target`).
pub fn pause(
  controller: RemoteController,
  target: Option(String),
) -> Result(Nil, RemoteError) {
  command(controller, "pause", target)
}

/// `next` (see [play](#play) for `target`).
pub fn next(
  controller: RemoteController,
  target: Option(String),
) -> Result(Nil, RemoteError) {
  command(controller, "next", target)
}

/// `previous` (see [play](#play) for `target`).
pub fn previous(
  controller: RemoteController,
  target: Option(String),
) -> Result(Nil, RemoteError) {
  command(controller, "previous", target)
}

/// Seek the target device to `position_ms` (`None` target broadcasts).
pub fn seek(
  controller: RemoteController,
  target: Option(String),
  position_ms: Int,
) -> Result(Nil, RemoteError) {
  decode_ack(controller_seek_ffi(
    controller.handle,
    target_to_string(target),
    position_ms,
  ))
}

/// Jump to `index` in the target device's queue (`None` target broadcasts).
pub fn queue_jump(
  controller: RemoteController,
  target: Option(String),
  index: Int,
) -> Result(Nil, RemoteError) {
  decode_ack(controller_queue_jump_ffi(
    controller.handle,
    target_to_string(target),
    index,
  ))
}

/// Remove queue item `index` on the target device (`None` target broadcasts).
pub fn queue_remove(
  controller: RemoteController,
  target: Option(String),
  index: Int,
) -> Result(Nil, RemoteError) {
  decode_ack(controller_queue_remove_ffi(
    controller.handle,
    target_to_string(target),
    index,
  ))
}

/// Enqueue tracks on the target device. `mode` is `"now"` / `"next"` / `"last"`;
/// `None` target broadcasts.
pub fn enqueue(
  controller: RemoteController,
  target: Option(String),
  tracks: List(QueueItem),
  mode: String,
  shuffle: Bool,
  start_index: Int,
) -> Result(Nil, RemoteError) {
  decode_ack(controller_enqueue_ffi(
    controller.handle,
    target_to_string(target),
    queue_items_to_json(tracks),
    mode,
    shuffle,
    start_index,
  ))
}

/// Send a simple command (`play` / `pause` / `next` / `previous`).
fn command(
  controller: RemoteController,
  action: String,
  target: Option(String),
) -> Result(Nil, RemoteError) {
  decode_ack(controller_command_ffi(
    controller.handle,
    action,
    target_to_string(target),
  ))
}

/// An empty target string means "broadcast to all devices" on the native side.
fn target_to_string(target: Option(String)) -> String {
  option.unwrap(target, "")
}

// ---- decoders -------------------------------------------------------------

fn event_decoder() -> decode.Decoder(Event) {
  use type_ <- decode.field("type", decode.string)
  case type_ {
    "devices" -> {
      use primary <- decode.optional_field(
        "primaryDevice",
        None,
        decode.optional(decode.string),
      )
      use devices <- decode.optional_field(
        "devices",
        [],
        decode.list(device_decoder()),
      )
      decode.success(Devices(primary_device: primary, devices: devices))
    }
    "device_registered" -> {
      use device_id <- decode.field("deviceId", decode.string)
      use name <- decode.optional_field("name", "", decode.string)
      decode.success(DeviceRegistered(device_id: device_id, name: name))
    }
    "device_unregistered" -> {
      use device_id <- decode.field("deviceId", decode.string)
      decode.success(DeviceUnregistered(device_id: device_id))
    }
    "primary_changed" -> {
      use device_id <- decode.field("deviceId", decode.string)
      decode.success(PrimaryChanged(device_id: device_id))
    }
    "now_playing" -> {
      use device_id <- decode.field("deviceId", decode.string)
      use device_name <- decode.optional_field("deviceName", "", decode.string)
      use track <- decode.field("track", now_playing_decoder())
      decode.success(NowPlayingEvent(
        device_id: device_id,
        device_name: device_name,
        track: track,
      ))
    }
    "status" -> {
      use device_id <- decode.field("deviceId", decode.string)
      use device_name <- decode.optional_field("deviceName", "", decode.string)
      use status <- decode.field("status", status_decoder())
      decode.success(StatusEvent(
        device_id: device_id,
        device_name: device_name,
        status: status,
      ))
    }
    "queue" -> {
      use device_id <- decode.field("deviceId", decode.string)
      use device_name <- decode.optional_field("deviceName", "", decode.string)
      use index <- decode.optional_field("index", 0, decode.int)
      use queue <- decode.optional_field(
        "queue",
        [],
        decode.list(queue_item_decoder()),
      )
      decode.success(QueueEvent(
        device_id: device_id,
        device_name: device_name,
        index: index,
        queue: queue,
      ))
    }
    _ -> decode.failure(DeviceUnregistered(device_id: ""), "Event")
  }
}

fn device_decoder() -> decode.Decoder(Device) {
  use device_id <- decode.field("deviceId", decode.string)
  use name <- decode.optional_field("name", "", decode.string)
  use now_playing <- decode.optional_field(
    "nowPlaying",
    None,
    decode.optional(now_playing_decoder()),
  )
  use queue_index <- decode.optional_field("queueIndex", 0, decode.int)
  use queue <- decode.optional_field(
    "queue",
    [],
    decode.list(queue_item_decoder()),
  )
  decode.success(Device(
    device_id: device_id,
    name: name,
    now_playing: now_playing,
    queue_index: queue_index,
    queue: queue,
  ))
}
