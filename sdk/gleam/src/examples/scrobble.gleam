//// Record a play with the pipe-friendly builder API.
////
//// Run with:
////   gleam run -m examples/scrobble

import gleam/io
import gleam/option
import gleam/string
import rocksky
import rocksky/scrobble

pub fn main() {
  let client =
    rocksky.new()
    |> rocksky.with_bearer_token("YOUR_BSKY_TOKEN")

  let result =
    scrobble.new_scrobble(title: "Karma Police", artist: "Radiohead")
    |> scrobble.with_album("OK Computer")
    |> scrobble.with_duration_ms(263_000)
    |> scrobble.with_year(1997)
    |> scrobble.with_track_number(6)
    |> scrobble.with_spotify_link(
      "https://open.spotify.com/track/63OQupATfueTdZMWTxW03A",
    )
    |> scrobble.create
    |> rocksky.send(client)

  case result {
    Ok(view) ->
      io.println(
        "scrobbled: "
        <> option.unwrap(view.title, "?")
        <> " — "
        <> option.unwrap(view.artist, "?"),
      )
    Error(e) -> io.println_error("scrobble failed: " <> string.inspect(e))
  }
}
