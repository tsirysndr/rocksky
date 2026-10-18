//// Rocksky OAuth metadata, scopes, keys and persistent stores.

import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/oauth.{type Client as OauthClient}
import rocksky_api/auth/store.{type Store}
import rocksky_api/env.{type Env}
import rocksky_api/task.{type Task}

pub const scopes = [
  "atproto", "repo:app.rocksky.album", "repo:app.rocksky.artist",
  "repo:app.rocksky.graph.follow", "repo:app.rocksky.like",
  "repo:app.rocksky.playlist", "repo:app.rocksky.playlist.song",
  "repo:app.rocksky.scrobble", "repo:app.rocksky.shout", "repo:app.rocksky.song",
  "repo:app.rocksky.feed.generator", "repo:fm.teal.feed.play",
  "repo:fm.teal.actor.status", "repo:fm.teal.alpha.feed.play",
  "repo:fm.teal.alpha.actor.status", "repo:app.rocksky.actor.status",
  "repo:app.rocksky.rockbox.audio.settings", "repo:app.rocksky.equalizer",
  "repo:community.lexicon.calendar.rsvp",
]

pub fn scope_string() -> String {
  string.join(scopes, " ")
}

pub fn create(
  env: Env,
  sqlite: Store,
  overrides: List(#(String, String)),
) -> Task(OauthClient) {
  let public_url = env.public_url
  let local = string.contains(public_url, "localhost")
  let url = case local {
    True -> "http://127.0.0.1:" <> int_to_string(env.port)
    False -> public_url
  }
  let https = string.starts_with(url, "https")
  let scope = scope_string()
  let client_id = case local {
    False -> url <> "/oauth-client-metadata.json"
    True ->
      "http://localhost?redirect_uri="
      <> encode_uri_component(url <> "/oauth/callback")
      <> "&scope="
      <> encode_uri_component(scope)
  }
  task.attempt_result(
    oauth.create_client(oauth.Config(
      client_name: "Rocksky",
      client_id:,
      client_uri: url,
      redirect_uris: [url <> "/oauth/callback"],
      scope:,
      confidential: https,
      jwks_uri: case https {
        True -> Some(url <> "/jwks.json")
        False -> None
      },
      private_keys: [env.private_key_1, env.private_key_2, env.private_key_3],
      state_store: store.state_store(sqlite),
      session_store: store.session_store(sqlite),
      redis_url: env.redis_url,
      pds_host_overrides: overrides,
    )),
  )
}

@external(javascript, "../context_ffi.mjs", "encodeURIComponent")
fn encode_uri_component(s: String) -> String

@external(javascript, "../context_ffi.mjs", "intToString")
fn int_to_string(i: Int) -> String
