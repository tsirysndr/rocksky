import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/json
import gleam/result
import rocksky_cli/client
import rocksky_cli/node
import rocksky_cli/value

pub fn credentials() -> promise.Promise(Result(Dynamic, String)) {
  let saved =
    node.read(node.state_path("navidrome.json")) |> result.try(value.parse)
  case saved {
    Ok(data) ->
      case
        value.string(data, "handle") != "" && value.string(data, "apiKey") != ""
      {
        True -> promise.resolve(Ok(data))
        False -> create_credentials()
      }
    Error(_) -> create_credentials()
  }
}

fn create_credentials() -> promise.Promise(Result(Dynamic, String)) {
  use profile <- promise.await(client.get("/profile", []))
  case profile {
    Error(e) -> promise.resolve(Error(e))
    Ok(profile) -> {
      use key <- promise.map(client.post(
        "/apikeys",
        json.object([#("name", json.string("rocksky-cli"))]),
      ))
      use key <- result.try(key)
      let text =
        json.object([
          #("handle", json.string(value.string(profile, "handle"))),
          #("apiKey", json.string(value.string(key, "api_key"))),
        ])
        |> json.to_string
      let _ = node.write(node.state_path("navidrome.json"), text)
      value.parse(text)
    }
  }
}

pub fn url(
  method: String,
  creds: Dynamic,
  params: List(#(String, String)),
) -> String {
  "https://navidrome.rocksky.app/rest/"
  <> method
  <> "?"
  <> client.query([
    #("u", value.string(creds, "handle")),
    #("p", value.string(creds, "apiKey")),
    #("c", "rocksky"),
    #("v", "1.16.1"),
    #("f", "json"),
    ..params
  ])
}

pub fn call(
  method: String,
  params: List(#(String, String)),
) -> promise.Promise(Result(Dynamic, String)) {
  use creds <- promise.await(credentials())
  case creds {
    Error(e) -> promise.resolve(Error(e))
    Ok(creds) -> {
      use response <- promise.map(node.fetch_json(
        url(method, creds, params),
        "GET",
        "",
        "",
      ))
      use data <- result.try(response)
      let data = value.field(data, "subsonic-response")
      case value.string(data, "status") {
        "ok" -> Ok(data)
        _ -> Error(value.at(data, ["error", "message"]) |> value.text)
      }
    }
  }
}

pub fn procedure(
  name: String,
  body: json.Json,
) -> promise.Promise(Result(Dynamic, String)) {
  use response <- promise.map(client.post(
    "/xrpc/app.rocksky.library." <> name,
    body,
  ))
  use data <- result.try(response)
  case value.string(data, "atprotoError") {
    "" -> Ok(data)
    message -> Error(message)
  }
}
