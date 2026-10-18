//// Rocksky's custom OAuth authorization flow (including prompt forwarding).

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/list
import gleam/option.{Some}
import gleam/result
import rocksky_api/atproto/oauth_runtime as runtime
import rocksky_api/auth/oauth_client_auth as auth
import rocksky_api/error
import rocksky_api/node/js
import rocksky_api/node/web_url
import rocksky_api/task

fn text(options: Dynamic, key: String) {
  decode.run(js.get(options, key), decode.string) |> option.from_result
}

pub fn authorize(client: Dynamic, input: String, options: Dynamic) {
  let config = runtime.metadata(client)
  let redirect =
    text(options, "redirect_uri")
    |> option.unwrap(list.first(config.redirects) |> result.unwrap(""))
  use _ <- task.then(case list.contains(config.redirects, redirect) {
    True -> task.ok(Nil)
    False -> task.fail(error.Message("Invalid redirect_uri"))
  })
  use server <- task.then(
    runtime.resolve(client, input, js.get(options, "signal"))
    |> task.attempt_result,
  )
  use pkce <- task.then(runtime.pkce(client) |> task.attempt_result)
  use key <- task.then(
    runtime.key(
      client,
      option.unwrap(server.dpop_algorithms, [auth.fallback_alg]),
    )
    |> task.attempt_result,
  )
  use method <- task.then(
    auth.negotiate(
      config.method,
      server.auth_methods,
      server.auth_algorithms,
      runtime.signing_keys(
        client,
        option.unwrap(server.auth_algorithms, [auth.fallback_alg]),
      ),
    )
    |> result.map_error(error.Message)
    |> task.from_result,
  )
  let method = case method {
    auth.Public -> js.object([#("method", js.coerce("none"))])
    auth.PrivateKeyJwt(kid) ->
      js.object([
        #("method", js.coerce("private_key_jwt")),
        #("kid", js.coerce(kid)),
      ])
  }
  use state <- task.then(runtime.nonce(client) |> task.attempt_result)
  use _ <- task.then(
    runtime.save_state(
      client,
      state,
      js.object([
        #("iss", js.coerce(server.issuer)),
        #("authMethod", method),
        #("dpopKey", key),
        #("verifier", js.coerce(pkce.verifier)),
        #("appState", js.get(options, "state")),
      ]),
    )
    |> task.attempt_result,
  )
  let parameters =
    js.entries(options) |> list.filter(fn(p) { p.0 != "signal" }) |> js.object
  let required = [
    #("client_id", config.client_id),
    #("redirect_uri", redirect),
    #("code_challenge", pkce.challenge),
    #("code_challenge_method", pkce.method),
    #("state", state),
    #("response_mode", config.response_mode),
    #("response_type", "code"),
    #("scope", text(options, "scope") |> option.unwrap(config.scope)),
  ]
  list.each(required, fn(p) {
    let _ = js.set(parameters, p.0, js.coerce(p.1))
    Nil
  })
  let hint = case
    server.identity && option.unwrap(text(options, "prompt"), "") == ""
  {
    True -> js.coerce(input)
    False -> js.undefined()
  }
  let _ = js.set(parameters, "login_hint", hint)
  use url <- task.then(
    web_url.parse(server.endpoint) |> error.map_js |> task.from_result,
  )
  use _ <- task.then(case web_url.protocol(url) {
    "https:" | "http:" -> task.ok(Nil)
    protocol ->
      task.fail(error.Message(
        "Invalid authorization endpoint protocol: " <> protocol,
      ))
  })
  case server.par_endpoint {
    Some(endpoint) if endpoint != "" -> {
      use request_uri <- task.map(
        runtime.par(client, server.raw, method, key, parameters)
        |> task.attempt_result,
      )
      web_url.set_query(url, "client_id", config.client_id)
      web_url.set_query(url, "request_uri", request_uri)
      web_url.href(url)
    }
    _ ->
      case server.require_par {
        True ->
          task.fail(error.Message(
            "Server requires pushed authorization requests (PAR) but no PAR endpoint is available",
          ))
        False -> {
          js.entries(parameters)
          |> list.each(fn(p) {
            case js.truthy(p.1) {
              True -> web_url.set_query(url, p.0, js.to_string(p.1))
              False -> Nil
            }
          })
          case web_url.request_length(url) < 2048 {
            True -> task.ok(web_url.href(url))
            False -> task.fail(error.Message("Login URL too long"))
          }
        }
      }
  }
}
