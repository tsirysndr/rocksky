//// Read-only tour of the native Rocksky core (no auth needed).
////
//// Run with:
////   gleam run -m examples/native_core
////
//// Needs the native lib — for monorepo dev, use the local path dep in
//// gleam.toml and build ../erlang/build-core.sh first.

import gleam/io
import gleam/string
import rocksky/client

pub fn main() {
  io.println(
    "song hash: " <> client.song_hash("Chaser", "Calibro 35", "Jazzploitation"),
  )
  // Envelope calls return Dynamic ({ok, value} | {error, message}); inspect it.
  io.println("global stats: " <> string.inspect(client.global_stats()))
  io.println("top tracks: " <> string.inspect(client.top_tracks(5, 0)))
}
