import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import rocksky_cli/node
import rocksky_cli/value

pub fn base_url() -> String {
  case node.env("ROCKSKY_API_URL") {
    "" -> "https://api.rocksky.app"
    url -> string.trim_end(url)
  }
}

pub fn token() -> String {
  node.read(node.state_path("token.json"))
  |> result.try(value.parse)
  |> result.map(fn(v) { value.string(v, "token") })
  |> result.unwrap("")
}

pub fn query(params: List(#(String, String))) -> String {
  params
  |> list.filter(fn(p) { p.1 != "" })
  |> list.map(fn(p) { node.encode(p.0) <> "=" <> node.encode(p.1) })
  |> string.join("&")
}

pub fn get(
  path: String,
  params: List(#(String, String)),
) -> promise.Promise(Result(Dynamic, String)) {
  let q = query(params)
  node.fetch_json(
    base_url()
      <> path
      <> case q {
      "" -> ""
      _ -> "?" <> q
    },
    "GET",
    token(),
    "",
  )
}

pub fn post(
  path: String,
  body: json.Json,
) -> promise.Promise(Result(Dynamic, String)) {
  node.fetch_json(base_url() <> path, "POST", token(), json.to_string(body))
}

pub fn xrpc(
  name: String,
  params: List(#(String, String)),
) -> promise.Promise(Result(Dynamic, String)) {
  get("/xrpc/app.rocksky." <> name, params)
}

pub fn actor(did: String) -> promise.Promise(Result(String, String)) {
  case did {
    "" ->
      case node.read(node.state_path("did")) {
        Ok(did) if did != "" -> promise.resolve(Ok(string.trim(did)))
        _ -> {
          use response <- promise.map(get("/profile", []))
          use profile <- result.try(response)
          let did = value.string(profile, "did")
          case did {
            "" -> Error("No account DID returned. Run rocksky login <handle>.")
            _ -> {
              let _ = node.write(node.state_path("did"), did)
              Ok(did)
            }
          }
        }
      }
    _ -> promise.resolve(Ok(did))
  }
}
