//// `app.rocksky.graph.*` — follow graph.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.graph.followAccount` — follow an actor (`did` or handle).
pub fn follow(account account: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.graph.followAccount", decode.dynamic)
  |> rocksky.param("account", account)
}

/// `app.rocksky.graph.unfollowAccount` — unfollow an actor.
pub fn unfollow(account account: String) -> Request(Dynamic) {
  rocksky.procedure("app.rocksky.graph.unfollowAccount", decode.dynamic)
  |> rocksky.param("account", account)
}

/// `app.rocksky.graph.getFollowers` — list followers of `actor`. Refine with
/// `with_dids`, `rocksky.limit`, `rocksky.cursor`.
pub fn get_followers(actor actor: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.graph.getFollowers", decode.dynamic)
  |> rocksky.param("actor", actor)
}

/// `app.rocksky.graph.getFollows` — list accounts `actor` follows.
pub fn get_follows(actor actor: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.graph.getFollows", decode.dynamic)
  |> rocksky.param("actor", actor)
}

/// `app.rocksky.graph.getKnownFollowers` — followers known to the viewer.
pub fn get_known_followers(actor actor: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.graph.getKnownFollowers", decode.dynamic)
  |> rocksky.param("actor", actor)
}

/// Filter the result to a specific set of DIDs (server-side).
pub fn with_dids(req: Request(a), dids: List(String)) -> Request(a) {
  rocksky.repeated_param(req, "dids", dids)
}
