import gleam/dynamic/decode
import gleam/json
import gleam/option.{Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/error
import rocksky_api/node/axios
import rocksky_api/node/crypto
import rocksky_api/node/fetch
import rocksky_api/node/hono
import rocksky_api/node/js
import rocksky_api/task

pub fn post(
  client: axios.Instance,
  method: String,
  fields: List(#(String, json.Json)),
) {
  axios.post(client, method, json.object(fields), axios.default_options())
  |> task.attempt_result
}

pub fn post_json(
  client: axios.Instance,
  method: String,
  fields: List(#(String, json.Json)),
) {
  post(client, method, fields)
  |> task.map(fn(r) { row.dynamic_to_json(r.data) })
}

pub fn exchange(ctx: Context, url: String, fields: List(#(String, json.Json))) {
  use response <- task.then(
    axios.post_raw(
      axios.global(),
      url,
      js.coerce(fetch.query(json.object(fields))),
      axios.with_headers([
        #("Content-Type", "application/x-www-form-urlencoded"),
      ]),
    )
    |> task.attempt_result,
  )
  use refresh <- task.then(
    decode.run(response.data, decode.at(["refresh_token"], decode.string))
    |> result.map_error(error.Decode("OAuth refresh token", _))
    |> task.from_result,
  )
  crypto.aes_ctr_encrypt(
    refresh,
    ctx.env.spotify_encryption_key,
    ctx.env.spotify_encryption_iv,
  )
  |> result.map_error(error.Js)
  |> task.from_result
}

pub fn email(c: hono.Context) {
  use raw <- task.then(hono.json_body(c) |> task.attempt_result)
  use email <- task.then(
    decode.run(raw, decode.at(["email"], decode.string))
    |> result.map_error(fn(_) { error.InvalidRequest("Invalid email") })
    |> task.from_result,
  )
  case
    js.regex_test(
      "^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$",
      email,
    )
  {
    True -> task.ok(email)
    False -> task.fail(error.InvalidRequest("Invalid email"))
  }
}

pub fn join_beta(ctx: Context, email: String) {
  fetch.request(
    "https://beta.rocksky.app",
    "POST",
    [
      #("Content-Type", "application/json"),
      #("Authorization", "Bearer " <> ctx.env.rocksky_beta_token),
    ],
    Some(json.object([#("email", json.string(email))]) |> json.to_string),
  )
  |> task.attempt_result
  |> task.map(fn(_) { json.object([#("status", json.string("ok"))]) })
}

pub fn download(response: axios.Response) {
  hono.body_response(
    response.data,
    [
      #(
        "Content-Type",
        list_key(response.headers, "content-type", "application/octet-stream"),
      ),
      #(
        "Content-Disposition",
        list_key(response.headers, "content-disposition", "attachment"),
      ),
    ],
    200,
  )
}

fn list_key(headers, key, default) {
  headers |> gleam_list_key(key) |> result.unwrap(default)
}

fn gleam_list_key(headers, key) {
  case headers {
    [] -> Error(Nil)
    [#(k, v), ..rest] ->
      case string.lowercase(k) == key {
        True -> Ok(v)
        False -> gleam_list_key(rest, key)
      }
  }
}
