//// Individual SDK operations used by the Gleam authorization flow.

import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import gleam/option.{type Option}
import rocksky_api/node/js.{type Exception}

pub type Metadata {
  Metadata(
    raw: Dynamic,
    identity: Bool,
    issuer: String,
    endpoint: String,
    par_endpoint: Option(String),
    require_par: Bool,
    dpop_algorithms: Option(List(String)),
    auth_methods: List(String),
    auth_algorithms: Option(List(String)),
  )
}

pub type ClientMetadata {
  ClientMetadata(
    client_id: String,
    redirects: List(String),
    scope: String,
    method: String,
    response_mode: String,
  )
}

pub type Pkce {
  Pkce(verifier: String, challenge: String, method: String)
}

@external(javascript, "./oauth_runtime_ffi.mjs", "metadata")
pub fn metadata(client: Dynamic) -> ClientMetadata

@external(javascript, "./oauth_runtime_ffi.mjs", "resolve")
pub fn resolve(
  client: Dynamic,
  input: String,
  signal: Dynamic,
) -> Promise(Result(Metadata, Exception))

@external(javascript, "./oauth_runtime_ffi.mjs", "pkce")
pub fn pkce(client: Dynamic) -> Promise(Result(Pkce, Exception))

@external(javascript, "./oauth_runtime_ffi.mjs", "key")
pub fn key(
  client: Dynamic,
  algorithms: List(String),
) -> Promise(Result(Dynamic, Exception))

@external(javascript, "./oauth_runtime_ffi.mjs", "signingKeys")
pub fn signing_keys(
  client: Dynamic,
  algorithms: List(String),
) -> Option(List(String))

@external(javascript, "./oauth_runtime_ffi.mjs", "nonce")
pub fn nonce(client: Dynamic) -> Promise(Result(String, Exception))

@external(javascript, "./oauth_runtime_ffi.mjs", "saveState")
pub fn save_state(
  client: Dynamic,
  state: String,
  data: Dynamic,
) -> Promise(Result(Nil, Exception))

@external(javascript, "./oauth_runtime_ffi.mjs", "par")
pub fn par(
  client: Dynamic,
  metadata: Dynamic,
  auth_method: Dynamic,
  key: Dynamic,
  parameters: Dynamic,
) -> Promise(Result(String, Exception))
