//// Latest scrobble per user, optionally filtered by feed or restricted to
//// people the viewer follows.
////
//// Run with:
////   gleam run -m examples/stories

import gleam/dynamic/decode
import gleam/int
import gleam/io
import gleam/list
import rocksky
import rocksky/feed

const metalcore = "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore"

pub fn main() {
  let client = rocksky.new()

  // Latest scrobble per user, narrowed to the metalcore feed.
  let assert Ok(payload) =
    feed.get_stories()
    |> rocksky.int_param("size", 10)
    |> rocksky.param("feed", metalcore)
    |> rocksky.send(client)

  let row_decoder = {
    use handle <- decode.optional_field("handle", "?", decode.string)
    use artist <- decode.optional_field("artist", "?", decode.string)
    use title <- decode.optional_field("title", "?", decode.string)
    decode.success(#(handle, artist, title))
  }
  let result_decoder = {
    use stories <- decode.optional_field(
      "stories",
      [],
      decode.list(row_decoder),
    )
    decode.success(stories)
  }
  let assert Ok(stories) = decode.run(payload, result_decoder)
  list.each(stories, fn(s) {
    let #(handle, artist, title) = s
    io.println("@" <> handle <> "  " <> artist <> " — " <> title)
  })
  io.println("\n" <> int.to_string(list.length(stories)) <> " stories")

  // For an authenticated client, add:
  //   |> rocksky.with_bearer_token(token)
  // and then chain the request with:
  //   |> rocksky.bool_param("following", True)
}
