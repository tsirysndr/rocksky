//// Walk through every scrobble for an actor by following the `offset` cursor.
////
//// Run with:
////   gleam run -m examples/paginate_scrobbles

import gleam/int
import gleam/io
import gleam/list
import gleam/option
import rocksky
import rocksky/actor
import rocksky/types.{type Scrobble}

const page_size: Int = 50

pub fn main() {
  let client = rocksky.new()
  let total = walk(client, "tsiry.bsky.social", 0, 0)
  io.println("done — counted " <> int.to_string(total) <> " scrobbles")
}

fn walk(
  client: rocksky.Client,
  did: String,
  offset: Int,
  counted: Int,
) -> Int {
  let result =
    actor.get_actor_scrobbles(did: did)
    |> rocksky.limit(page_size)
    |> rocksky.offset(offset)
    |> rocksky.send(client)

  case result {
    Ok(batch) -> {
      let n = list.length(batch)
      print_batch(batch, offset)
      case n < page_size {
        True -> counted + n
        False -> walk(client, did, offset + n, counted + n)
      }
    }
    Error(_) -> counted
  }
}

fn print_batch(batch: List(Scrobble), start_offset: Int) -> Nil {
  list.index_fold(batch, Nil, fn(_acc, scrobble, i) {
    io.println(
      int.to_string(start_offset + i)
      <> ": "
      <> option.unwrap(scrobble.title, "?")
      <> " — "
      <> option.unwrap(scrobble.artist, "?"),
    )
    Nil
  })
}
