//// Fetch Wrapped-style stats and pull out the most-active hour and the
//// total scrobble count.
////
//// Run with:
////   gleam run -m examples/wrapped

import gleam/dynamic/decode
import gleam/int
import gleam/io
import rocksky
import rocksky/stats

pub fn main() {
  let client = rocksky.new()

  let assert Ok(payload) =
    stats.get_wrapped(did: "tsiry.bsky.social")
    |> rocksky.year(2025)
    |> rocksky.send(client)

  let summary_decoder = {
    use total <- decode.optional_field("totalScrobbles", 0, decode.int)
    use minutes <- decode.optional_field(
      "totalListeningTimeMinutes",
      0,
      decode.int,
    )
    use most_active_hour <- decode.optional_field(
      "mostActiveHour",
      -1,
      decode.int,
    )
    decode.success(#(total, minutes, most_active_hour))
  }

  let assert Ok(#(total, minutes, hour)) = decode.run(payload, summary_decoder)
  io.println("scrobbles: " <> int.to_string(total))
  io.println("listening minutes: " <> int.to_string(minutes))
  io.println("most active hour: " <> int.to_string(hour))

  // Without `year` the server falls back to the current year.
  let _ =
    stats.get_wrapped(did: "tsiry.bsky.social")
    |> rocksky.send(client)
}
