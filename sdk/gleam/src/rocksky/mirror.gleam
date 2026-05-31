//// `app.rocksky.mirror.*` — configure external scrobble mirroring sources.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import rocksky.{type Request}

/// `app.rocksky.mirror.getMirrorSources` — list the user's mirror sources.
pub fn get_sources() -> Request(Dynamic) {
  rocksky.query("app.rocksky.mirror.getMirrorSources", decode.dynamic)
}

/// `app.rocksky.mirror.putMirrorSource` — upsert a mirror source. Refine
/// with `with_enabled`, `with_external_username`, `with_api_key`.
pub fn put_source(provider provider: String) -> Request(Dynamic) {
  let body = json.object([#("provider", json.string(provider))])
  rocksky.procedure("app.rocksky.mirror.putMirrorSource", decode.dynamic)
  |> rocksky.body(body)
}

pub fn with_enabled(req: Request(a), enabled: Bool) -> Request(a) {
  rocksky.bool_param(req, "enabled", enabled)
}

pub fn with_external_username(req: Request(a), username: String) -> Request(a) {
  rocksky.param(req, "externalUsername", username)
}

pub fn with_api_key(req: Request(a), key: String) -> Request(a) {
  rocksky.param(req, "apiKey", key)
}
