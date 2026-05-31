//// Fetch and print a Rocksky profile.
////
//// Run with:
////   gleam run -m examples/profile

import gleam/io
import gleam/option
import gleam/string
import rocksky
import rocksky/actor

pub fn main() {
  let client = rocksky.new()

  let result =
    actor.get_profile(did: "tsiry.bsky.social")
    |> rocksky.send(client)

  case result {
    Ok(profile) -> {
      io.println("did:          " <> option.unwrap(profile.did, "?"))
      io.println("handle:       " <> option.unwrap(profile.handle, "?"))
      io.println("display name: " <> option.unwrap(profile.display_name, "?"))
      io.println("avatar:       " <> option.unwrap(profile.avatar, "?"))
    }
    Error(err) -> io.println_error("Failed: " <> string.inspect(err))
  }
}
