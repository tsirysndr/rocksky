//// Remote player + controller tour (needs a Rocksky access token).
////
//// Run with:
////   gleam run -m examples/remote
////
//// Needs the native lib — for monorepo dev, use the local path dep in
//// gleam.toml and build ../erlang/build-core.sh first. Set your token below.
////
//// Both roles use a blocking poll loop: call `next_command` / `next_event` in a
//// loop (typically on its own process) until it returns `Ok(None)`.

import gleam/io
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky/remote_controller
import rocksky/remote_player.{NowPlaying, QueueItem}

const token = "YOUR_ACCESS_TOKEN"

pub fn main() {
  // --- player: advertise what you're playing, react to commands ---
  let player = remote_player.connect(token, "My Gleam Player")
  let _ = remote_player.set_status(player, remote_player.Playing)
  let _ =
    remote_player.set_now_playing(
      player,
      NowPlaying(
        title: "Chaser",
        artist: "Calibro 35",
        album: "Jazzploitation",
        album_artist: "Calibro 35",
        album_art: "",
        duration_ms: 214_000,
        elapsed_ms: 0,
        is_playing: True,
        codec: Some("flac"),
        sample_rate: Some(44_100),
      ),
    )
  let _ =
    remote_player.set_queue(
      player,
      [
        QueueItem(
          upload_id: "",
          track_id: "",
          title: "Chaser",
          artist: "Calibro 35",
          album: "Jazzploitation",
          album_artist: "Calibro 35",
          album_art: "",
          duration_ms: 214_000,
          song_uri: "",
          album_uri: "",
          track_number: 1,
        ),
      ],
      0,
    )
  // Drain commands on a background process in a real app; shown inline here.
  player_loop(player)

  // --- controller: observe devices, drive the primary one ---
  let controller = remote_controller.connect(token, "My Gleam Controller")
  let _ = remote_controller.play(controller, None)
  // Broadcast pause, or target a device: `Some(device_id)`.
  let _ = remote_controller.seek(controller, Some("device-123"), 42_000)
  controller_loop(controller)
}

fn player_loop(player: remote_player.RemotePlayer) -> Nil {
  case remote_player.next_command(player) {
    Ok(Some(command)) -> {
      case command {
        remote_player.Play -> io.println("-> play")
        remote_player.Pause -> io.println("-> pause")
        remote_player.Next -> io.println("-> next")
        remote_player.Previous -> io.println("-> previous")
        remote_player.Seek(ms) -> io.println("-> seek " <> string.inspect(ms))
        remote_player.QueueJump(i) ->
          io.println("-> queue_jump " <> string.inspect(i))
        remote_player.QueueRemove(i) ->
          io.println("-> queue_remove " <> string.inspect(i))
        remote_player.Enqueue(tracks, mode, _, _) ->
          io.println(
            "-> enqueue " <> string.inspect(tracks) <> " mode=" <> mode,
          )
      }
      player_loop(player)
    }
    // None => disconnected; any decode/core error also ends the loop here.
    _ -> io.println("player disconnected")
  }
}

fn controller_loop(controller: remote_controller.RemoteController) -> Nil {
  case remote_controller.next_event(controller) {
    Ok(Some(event)) -> {
      case event {
        remote_controller.Devices(primary, devices) ->
          io.println(
            "devices: "
            <> string.inspect(devices)
            <> " primary="
            <> describe_primary(primary),
          )
        remote_controller.NowPlayingEvent(id, _, track) ->
          io.println("now playing on " <> id <> ": " <> track.title)
        remote_controller.StatusEvent(id, _, status) ->
          io.println("status on " <> id <> ": " <> string.inspect(status))
        other -> io.println(string.inspect(other))
      }
      controller_loop(controller)
    }
    _ -> io.println("controller disconnected")
  }
}

fn describe_primary(primary: Option(String)) -> String {
  case primary {
    Some(id) -> id
    None -> "(none)"
  }
}
