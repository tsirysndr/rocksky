//// `app.rocksky.apikey.*` — manage personal API keys.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json
import rocksky.{type Request}
import rocksky/decoders
import rocksky/types.{type ApiKey}

/// `app.rocksky.apikey.createApikey` — provision a new API key. Add a blurb
/// via `with_description` before sending.
pub fn create(name name: String) -> Request(ApiKey) {
  let body = json.object([#("name", json.string(name))])
  rocksky.procedure("app.rocksky.apikey.createApikey", decoders.api_key())
  |> rocksky.body(body)
  // Mirror the same value as a param so `with_description` can be added
  // even after the body is set.
  |> rocksky.param("name", name)
}

/// Attach an optional description to a `create` or `update` request.
pub fn with_description(req: Request(a), description: String) -> Request(a) {
  rocksky.param(req, "description", description)
}

/// `app.rocksky.apikey.getApikeys` — list current keys.
pub fn list_keys() -> Request(Dynamic) {
  rocksky.query("app.rocksky.apikey.getApikeys", decode.dynamic)
}

/// `app.rocksky.apikey.removeApikey` — revoke a key.
pub fn remove(id id: String) -> Request(ApiKey) {
  rocksky.procedure("app.rocksky.apikey.removeApikey", decoders.api_key())
  |> rocksky.param("id", id)
}

/// `app.rocksky.apikey.updateApikey` — rename or re-describe a key.
pub fn update(id id: String, name name: String) -> Request(ApiKey) {
  let body =
    json.object([#("id", json.string(id)), #("name", json.string(name))])
  rocksky.procedure("app.rocksky.apikey.updateApikey", decoders.api_key())
  |> rocksky.body(body)
}
