//// A Rocksky-controllable **remote player** over the remote-control WebSocket
//// (see `remote-ws/PROTOCOL.md`). It registers as a device, advertises what
//// you're playing (now-playing / status / queue), and hands you the commands a
//// miniplayer sends (play / pause / next / previous / seek / enqueue / queue
//// actions). Heartbeat, reconnect, and the device-id handshake are handled by
//// the native core.
////
//// It follows a **poll model**: build a player with [connect](#connect), then
//// call [next_command](#next_command) in a loop on a background process — it
//// blocks until the next command (or returns `Ok(None)` once disconnected):
////
////   let player = remote_player.connect(token, "My Player")
////   remote_player.set_status(player, remote_player.Playing)
////   remote_player.set_now_playing(player, track)
////   case remote_player.next_command(player) {
////     Ok(Some(remote_player.Play)) -> engine_play()
////     Ok(Some(remote_player.Seek(ms))) -> engine_seek(ms)
////     _ -> Nil
////   }
////
//// This module also owns the shared value types ([NowPlaying](#NowPlaying),
//// [QueueItem](#QueueItem), [Status](#Status)) and the `{ok|error}` envelope
//// helpers that `rocksky/remote_controller` reuses.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option}

/// The default remote-control WebSocket endpoint (used when no URL is given).
pub const default_remote_ws = "wss://api.rocksky.app/ws"

/// An opaque handle to a connected remote player — a NIF resource freed by the
/// BEAM GC. Build it with [connect](#connect).
pub opaque type RemotePlayer {
  RemotePlayer(handle: Dynamic)
}

// ---- shared value types --------------------------------------------------

/// Playback state you advertise with [set_now_playing](#set_now_playing), and
/// the shape carried by controller now-playing events.
pub type NowPlaying {
  NowPlaying(
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    album_art: String,
    duration_ms: Int,
    elapsed_ms: Int,
    is_playing: Bool,
  )
}

/// A single queue entry. Set `upload_id` (Rocksky uploads) or `track_id`
/// (Navidrome id); the rest is display metadata.
pub type QueueItem {
  QueueItem(
    upload_id: String,
    track_id: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    album_art: String,
    duration_ms: Int,
    song_uri: String,
    album_uri: String,
    track_number: Int,
  )
}

/// Transport state.
pub type Status {
  Playing
  Paused
  Stopped
}

/// A command a controller sent to this player, as decoded from
/// [next_command](#next_command).
pub type Command {
  Play
  Pause
  Next
  Previous
  Seek(position_ms: Int)
  QueueJump(index: Int)
  QueueRemove(index: Int)
  Enqueue(
    tracks: List(QueueItem),
    mode: String,
    shuffle: Bool,
    start_index: Int,
  )
}

/// Why a poll or state push failed.
pub type RemoteError {
  /// The native core returned `{"error": …}`.
  CoreError(message: String)
  /// The `{ok|error}` envelope (or its payload) could not be parsed/decoded.
  MalformedResponse(json.DecodeError)
}

// ---- FFI (rocksky_nif) ----------------------------------------------------

@external(erlang, "rocksky_nif", "remote_player_connect")
fn player_connect_ffi(token: String, name: String, url: String) -> Dynamic

@external(erlang, "rocksky_nif", "remote_player_next_command")
fn player_next_command_ffi(handle: Dynamic) -> String

@external(erlang, "rocksky_nif", "remote_player_set_now_playing")
fn player_set_now_playing_ffi(handle: Dynamic, track_json: String) -> String

@external(erlang, "rocksky_nif", "remote_player_set_status")
fn player_set_status_ffi(handle: Dynamic, status: String) -> String

@external(erlang, "rocksky_nif", "remote_player_set_queue")
fn player_set_queue_ffi(
  handle: Dynamic,
  items_json: String,
  index: Int,
) -> String

@external(erlang, "rocksky_nif", "remote_player_disconnect")
fn player_disconnect_ffi(handle: Dynamic) -> String

// ---- lifecycle ------------------------------------------------------------

/// Connect and register a controllable player in the background. `token` is a
/// Rocksky access token; `name` is the label shown in the device picker.
pub fn connect(token: String, name: String) -> RemotePlayer {
  RemotePlayer(handle: player_connect_ffi(token, name, ""))
}

/// [connect](#connect) against a custom WebSocket endpoint.
pub fn connect_at(token: String, name: String, url: String) -> RemotePlayer {
  RemotePlayer(handle: player_connect_ffi(token, name, url))
}

/// Disconnect and stop the background task. The handle stays valid until it is
/// garbage-collected.
pub fn disconnect(player: RemotePlayer) -> Result(Nil, RemoteError) {
  decode_ack(player_disconnect_ffi(player.handle))
}

// ---- state push -----------------------------------------------------------

/// Advertise the current track. Call whenever it changes, and periodically with
/// fresh `elapsed_ms` so controllers show smooth progress.
pub fn set_now_playing(
  player: RemotePlayer,
  track: NowPlaying,
) -> Result(Nil, RemoteError) {
  decode_ack(player_set_now_playing_ffi(
    player.handle,
    json.to_string(now_playing_to_json(track)),
  ))
}

/// Advertise transport [Status](#Status).
pub fn set_status(
  player: RemotePlayer,
  status: Status,
) -> Result(Nil, RemoteError) {
  decode_ack(player_set_status_ffi(player.handle, status_to_string(status)))
}

/// Advertise the current queue and the active `index`.
pub fn set_queue(
  player: RemotePlayer,
  items: List(QueueItem),
  index: Int,
) -> Result(Nil, RemoteError) {
  decode_ack(player_set_queue_ffi(
    player.handle,
    queue_items_to_json(items),
    index,
  ))
}

// ---- poll -----------------------------------------------------------------

/// Block until the next controller command. Returns `Ok(None)` once the player
/// is disconnected — the loop should stop then.
pub fn next_command(
  player: RemotePlayer,
) -> Result(Option(Command), RemoteError) {
  decode_envelope(
    player_next_command_ffi(player.handle),
    decode.optional(command_decoder()),
  )
}

// ---- envelope helpers (shared with remote_controller) ---------------------

/// Parse a `{"ok": <value>}` / `{"error": "…"}` JSON envelope, decoding the
/// `ok` payload with `inner`.
pub fn decode_envelope(
  raw: String,
  inner: decode.Decoder(a),
) -> Result(a, RemoteError) {
  case json.parse(raw, envelope_decoder(inner)) {
    Ok(Ok(value)) -> Ok(value)
    Ok(Error(message)) -> Error(CoreError(message))
    Error(err) -> Error(MalformedResponse(err))
  }
}

/// Parse an envelope whose `ok` payload is an ignored acknowledgement.
pub fn decode_ack(raw: String) -> Result(Nil, RemoteError) {
  decode_envelope(raw, decode.success(Nil))
}

fn envelope_decoder(
  inner: decode.Decoder(a),
) -> decode.Decoder(Result(a, String)) {
  decode.one_of(
    {
      use message <- decode.field("error", decode.string)
      decode.success(Error(message))
    },
    or: [
      {
        use value <- decode.field("ok", inner)
        decode.success(Ok(value))
      },
    ],
  )
}

// ---- encoders -------------------------------------------------------------

fn status_to_string(status: Status) -> String {
  case status {
    Playing -> "playing"
    Paused -> "paused"
    Stopped -> "stopped"
  }
}

fn now_playing_to_json(t: NowPlaying) -> json.Json {
  json.object([
    #("title", json.string(t.title)),
    #("artist", json.string(t.artist)),
    #("album", json.string(t.album)),
    #("albumArtist", json.string(t.album_artist)),
    #("albumArt", json.string(t.album_art)),
    #("durationMs", json.int(t.duration_ms)),
    #("elapsedMs", json.int(t.elapsed_ms)),
    #("isPlaying", json.bool(t.is_playing)),
  ])
}

/// Encode queue items to the JSON array the native `set_queue` / `enqueue`
/// entrypoints expect (input uses the `durationMs` key).
pub fn queue_items_to_json(items: List(QueueItem)) -> String {
  json.to_string(json.array(items, queue_item_to_json))
}

fn queue_item_to_json(it: QueueItem) -> json.Json {
  json.object([
    #("uploadId", json.string(it.upload_id)),
    #("trackId", json.string(it.track_id)),
    #("title", json.string(it.title)),
    #("artist", json.string(it.artist)),
    #("album", json.string(it.album)),
    #("albumArtist", json.string(it.album_artist)),
    #("albumArt", json.string(it.album_art)),
    #("durationMs", json.int(it.duration_ms)),
    #("songUri", json.string(it.song_uri)),
    #("albumUri", json.string(it.album_uri)),
    #("trackNumber", json.int(it.track_number)),
  ])
}

// ---- decoders (shared with remote_controller) -----------------------------

/// Decoder for a now-playing block as emitted by the native core (`durationMs`
/// / `elapsedMs` keys).
pub fn now_playing_decoder() -> decode.Decoder(NowPlaying) {
  use title <- decode.optional_field("title", "", decode.string)
  use artist <- decode.optional_field("artist", "", decode.string)
  use album <- decode.optional_field("album", "", decode.string)
  use album_artist <- decode.optional_field("albumArtist", "", decode.string)
  use album_art <- decode.optional_field("albumArt", "", decode.string)
  use duration_ms <- decode.optional_field("durationMs", 0, decode.int)
  use elapsed_ms <- decode.optional_field("elapsedMs", 0, decode.int)
  use is_playing <- decode.optional_field("isPlaying", True, decode.bool)
  decode.success(NowPlaying(
    title,
    artist,
    album,
    album_artist,
    album_art,
    duration_ms,
    elapsed_ms,
    is_playing,
  ))
}

/// Decoder for a queue item as emitted by the native core. Note the emitted
/// shape uses the `duration` key (ms), unlike the `durationMs` input key.
pub fn queue_item_decoder() -> decode.Decoder(QueueItem) {
  use upload_id <- decode.optional_field("uploadId", "", decode.string)
  use track_id <- decode.optional_field("trackId", "", decode.string)
  use title <- decode.optional_field("title", "", decode.string)
  use artist <- decode.optional_field("artist", "", decode.string)
  use album <- decode.optional_field("album", "", decode.string)
  use album_artist <- decode.optional_field("albumArtist", "", decode.string)
  use album_art <- decode.optional_field("albumArt", "", decode.string)
  use duration_ms <- decode.optional_field("duration", 0, decode.int)
  use song_uri <- decode.optional_field("songUri", "", decode.string)
  use album_uri <- decode.optional_field("albumUri", "", decode.string)
  use track_number <- decode.optional_field("trackNumber", 0, decode.int)
  decode.success(QueueItem(
    upload_id,
    track_id,
    title,
    artist,
    album,
    album_artist,
    album_art,
    duration_ms,
    song_uri,
    album_uri,
    track_number,
  ))
}

/// Decoder for a transport-status string (`playing` / `paused` / `stopped`).
pub fn status_decoder() -> decode.Decoder(Status) {
  use status <- decode.then(decode.string)
  case status {
    "playing" -> decode.success(Playing)
    "paused" -> decode.success(Paused)
    "stopped" -> decode.success(Stopped)
    _ -> decode.failure(Stopped, "Status")
  }
}

fn command_decoder() -> decode.Decoder(Command) {
  use action <- decode.field("action", decode.string)
  case action {
    "play" -> decode.success(Play)
    "pause" -> decode.success(Pause)
    "next" -> decode.success(Next)
    "previous" -> decode.success(Previous)
    "seek" -> {
      use position <- decode.field("position", decode.int)
      decode.success(Seek(position_ms: position))
    }
    "queue_jump" -> {
      use index <- decode.field("index", decode.int)
      decode.success(QueueJump(index: index))
    }
    "queue_remove" -> {
      use index <- decode.field("index", decode.int)
      decode.success(QueueRemove(index: index))
    }
    "enqueue" -> {
      use tracks <- decode.field("tracks", decode.list(queue_item_decoder()))
      use mode <- decode.optional_field("mode", "now", decode.string)
      use shuffle <- decode.optional_field("shuffle", False, decode.bool)
      use start_index <- decode.optional_field("startIndex", 0, decode.int)
      decode.success(Enqueue(
        tracks: tracks,
        mode: mode,
        shuffle: shuffle,
        start_index: start_index,
      ))
    }
    _ -> decode.failure(Play, "Command")
  }
}
