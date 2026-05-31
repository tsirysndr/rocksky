//// Run a full-text search and decode the dynamic payload.
////
//// `feed.search` returns the raw `Dynamic` value because the schema is open
//// and varies per query — this example shows the idiomatic way to decode it.
////
//// Run with:
////   gleam run -m examples/search

import gleam/dynamic/decode
import gleam/io
import gleam/list
import gleam/option
import rocksky
import rocksky/decoders
import rocksky/feed

pub fn main() {
  let client = rocksky.new()

  let assert Ok(payload) =
    feed.search(q: "radiohead")
    |> rocksky.send(client)

  let result_decoder = {
    use artists <- decode.optional_field(
      "artists",
      [],
      decode.list(decoders.artist()),
    )
    use songs <- decode.optional_field(
      "songs",
      [],
      decode.list(decoders.song()),
    )
    decode.success(#(artists, songs))
  }

  let assert Ok(#(artists, songs)) = decode.run(payload, result_decoder)

  io.println("artists:")
  list.each(artists, fn(artist) {
    io.println("  - " <> option.unwrap(artist.name, "?"))
  })
  io.println("songs:")
  list.each(songs, fn(song) {
    io.println(
      "  - "
      <> option.unwrap(song.title, "?")
      <> " — "
      <> option.unwrap(song.artist, "?"),
    )
  })
}
