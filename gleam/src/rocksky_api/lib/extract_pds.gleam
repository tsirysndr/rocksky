//// The PDS endpoint from a DID document.

import gleam/dynamic/decode
import gleam/list
import gleam/string
import rocksky_api/error
import rocksky_api/node/axios
import rocksky_api/task.{type Task}

pub fn from_did(plc_url: String, did: String) -> Task(String) {
  let url = case
    string.starts_with(did, "did:plc:"),
    string.starts_with(did, "did:web:")
  {
    True, _ -> Ok(plc_url <> "/" <> did)
    _, True ->
      Ok("https://" <> string.drop_start(did, 8) <> "/.well-known/did.json")
    _, _ -> Error(error.Message("Unsupported DID method"))
  }
  use url <- task.then(task.from_result(url))
  use response <- task.then(
    task.attempt_result(axios.get(axios.global(), url, axios.default_options()))
    |> task.map_error(fn(_) { error.Message("Failed to fetch DID doc") }),
  )
  let services =
    decode.run(
      response.data,
      decode.optionally_at(
        ["service"],
        [],
        decode.list({
          use type_ <- decode.field("type", decode.string)
          use id <- decode.field("id", decode.string)
          use endpoint <- decode.field("serviceEndpoint", decode.string)
          decode.success(#(type_, id, endpoint))
        }),
      ),
    )
  case services {
    Ok(services) ->
      case
        list.find(services, fn(s) {
          s.0 == "AtprotoPersonalDataServer"
          && string.ends_with(s.1, "#atproto_pds")
        })
      {
        Ok(#(_, _, endpoint)) -> task.ok(endpoint)
        Error(_) ->
          task.fail(error.NotFound("No PDS service in DID doc for " <> did))
      }
    Error(_) -> task.fail(error.Message("Malformed DID doc for " <> did))
  }
}
