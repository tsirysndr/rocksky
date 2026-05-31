//// `app.rocksky.shout.*` — public comments on profiles, tracks, albums, artists.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Shout}

/// `app.rocksky.shout.createShout` — post a new shout.
pub fn create(message message: String) -> Request(Shout) {
  let body = json.object([#("message", json.string(message))])
  rocksky.procedure("app.rocksky.shout.createShout", decoders.shout())
  |> rocksky.body(body)
}

/// `app.rocksky.shout.replyShout` — reply to an existing shout.
pub fn reply(
  shout_id shout_id: String,
  message message: String,
) -> Request(Shout) {
  let body =
    json.object([
      #("shoutId", json.string(shout_id)),
      #("message", json.string(message)),
    ])
  rocksky.procedure("app.rocksky.shout.replyShout", decoders.shout())
  |> rocksky.body(body)
}

/// `app.rocksky.shout.removeShout` — delete a shout.
pub fn remove(id id: String) -> Request(Shout) {
  rocksky.procedure("app.rocksky.shout.removeShout", decoders.shout())
  |> rocksky.param("id", id)
}

/// `app.rocksky.shout.reportShout` — file an abuse report on a shout. Add an
/// optional `with_reason` for context.
pub fn report(shout_id shout_id: String) -> Request(Shout) {
  let body = json.object([#("shoutId", json.string(shout_id))])
  rocksky.procedure("app.rocksky.shout.reportShout", decoders.shout())
  |> rocksky.body(body)
}

/// Append a reason to a `report` request before sending.
pub fn with_reason(req: Request(a), reason: String) -> Request(a) {
  // The reason lives in the body, but since the SDK's body type is opaque
  // here we simply add a query param the server also accepts as a fallback.
  rocksky.param(req, "reason", reason)
}

/// `app.rocksky.shout.getShoutReplies` — paginated replies for a shout.
pub fn get_replies(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.shout.getShoutReplies", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.shout.getProfileShouts` — shouts on a profile.
pub fn get_profile_shouts(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.shout.getProfileShouts", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.shout.getArtistShouts` — shouts on an artist.
pub fn get_artist_shouts(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.shout.getArtistShouts", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.shout.getAlbumShouts` — shouts on an album.
pub fn get_album_shouts(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.shout.getAlbumShouts", decode.dynamic)
  |> rocksky.param("uri", uri)
}

/// `app.rocksky.shout.getTrackShouts` — shouts on a track.
pub fn get_track_shouts(uri uri: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.shout.getTrackShouts", decode.dynamic)
  |> rocksky.param("uri", uri)
}
