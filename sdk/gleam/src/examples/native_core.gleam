//// Read-only tour of the native Rocksky core (no auth needed).
////
//// Run with:
////   gleam run -m examples/native_core
////
//// Needs the native lib — for monorepo dev, use the local path dep in
//// gleam.toml and build ../erlang/build-core.sh first.

import gleam/io
import rocksky/core

pub fn main() {
  io.println(
    "song hash: " <> core.song_hash("Chaser", "Calibro 35", "Jazzploitation"),
  )
  // Envelope calls return Dynamic ({ok, value} | {error, message}); inspect raw.
  // "" = the default AppView URL; pass any base to override.
  io.println("global stats:")
  echo core.global_stats("")
  io.println("top tracks:")
  echo core.top_tracks(5, 0, "")
  Nil
}
