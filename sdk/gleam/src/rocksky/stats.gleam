//// `app.rocksky.stats.*` — aggregate user statistics and Wrapped.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Stats}

/// `app.rocksky.stats.getStats` — high-level totals for an actor.
pub fn get_stats(did did: String) -> Request(Stats) {
  rocksky.query("app.rocksky.stats.getStats", decoders.stats())
  |> rocksky.param("did", did)
}

/// `app.rocksky.stats.getWrapped` — end-of-year style summary for an actor.
/// Use `rocksky.year` to scope to a year; omit it to use the current one.
pub fn get_wrapped(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.stats.getWrapped", decode.dynamic)
  |> rocksky.param("did", did)
}
