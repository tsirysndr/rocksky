//// `app.rocksky.actor.*` — profiles and per-actor catalogues.
////
//// All functions here return a `rocksky.Request(a)`. Pipe it through any
//// `rocksky.*` param helpers you need and finish with `rocksky.send(client)`.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type Profile, type Scrobble}

/// `app.rocksky.actor.getProfile` — fetch a profile by DID or handle.
pub fn get_profile(did did: String) -> Request(Profile) {
  rocksky.query("app.rocksky.actor.getProfile", decoders.profile())
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorScrobbles` — paginated scrobbles for an actor.
/// Returns the `scrobbles` array unwrapped.
pub fn get_actor_scrobbles(did did: String) -> Request(List(Scrobble)) {
  rocksky.query(
    "app.rocksky.actor.getActorScrobbles",
    decoders.unwrap("scrobbles", decoders.scrobble()),
  )
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorSongs` — paginated song catalogue for an actor.
pub fn get_actor_songs(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorSongs", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorArtists` — paginated artists for an actor.
pub fn get_actor_artists(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorArtists", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorAlbums` — paginated albums for an actor.
pub fn get_actor_albums(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorAlbums", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorLovedSongs` — paginated loved songs.
pub fn get_actor_loved_songs(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorLovedSongs", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorPlaylists` — paginated playlists for an actor.
pub fn get_actor_playlists(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorPlaylists", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorNeighbours` — listening-graph neighbours.
pub fn get_actor_neighbours(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorNeighbours", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.actor.getActorCompatibility` — compatibility with another actor.
/// Compares the **authenticated** user to `did`.
pub fn get_actor_compatibility(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.actor.getActorCompatibility", decode.dynamic)
  |> rocksky.param("did", did)
}
