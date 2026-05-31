//// Plug a custom transport into the client. Useful for tests, offline
//// playback of recorded fixtures, JS targets, request logging, retries, etc.
////
//// Run with:
////   gleam run -m examples/custom_transport

import gleam/http/request.{type Request as HttpRequest}
import gleam/http/response.{type Response as HttpResponse, Response}
import gleam/io
import gleam/option
import rocksky
import rocksky/actor

/// A fake transport that returns a canned profile no matter what is asked.
fn canned_transport(
  _req: HttpRequest(String),
) -> Result(HttpResponse(String), String) {
  let body =
    "{
      \"did\": \"did:plc:fixture\",
      \"handle\": \"fixture.test\",
      \"displayName\": \"Fixture\"
    }"
  Ok(Response(status: 200, headers: [], body: body))
}

pub fn main() {
  let client =
    rocksky.new()
    |> rocksky.with_send(canned_transport)

  let assert Ok(profile) =
    actor.get_profile(did: "anything")
    |> rocksky.send(client)
  io.println("handle: " <> option.unwrap(profile.handle, "?"))
}
