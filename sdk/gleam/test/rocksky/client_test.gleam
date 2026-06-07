//// Integration tests for the high-level client and Request builder.
//// We use `rocksky.with_send` to stub the HTTP layer so these run offline.
////
//// Each gleeunit test runs in its own process, so the per-process request
//// log set up by `mock_send` is naturally isolated between tests.

import gleam/http.{Get, Post}
import gleam/http/request.{type Request as HttpRequest}
import gleam/http/response.{Response}
import gleam/list
import gleam/option.{Some}
import gleam/string
import gleeunit/should
import rocksky
import rocksky/actor
import rocksky/error
import rocksky/feed
import rocksky/scrobble as scr

/// A canned-response transport: returns the same body for every call and
/// stashes the request in the process dictionary so tests can read it back.
fn mock_send(
  body: String,
  status: Int,
) -> #(rocksky.SendFn, fn() -> List(HttpRequest(String))) {
  clear_requests()
  let send = fn(req: HttpRequest(String)) -> Result(
    response.Response(String),
    String,
  ) {
    push_request(req)
    Ok(Response(status: status, headers: [], body: body))
  }
  #(send, read_requests)
}

pub fn new_client_defaults_test() {
  let client = rocksky.new()
  client
  |> rocksky.base_url
  |> should.equal("https://api.rocksky.app")
}

pub fn with_base_url_trims_slash_test() {
  let client =
    rocksky.new()
    |> rocksky.with_base_url("https://api.example.com/")
  client
  |> rocksky.base_url
  |> should.equal("https://api.example.com")
}

pub fn get_profile_builds_expected_request_test() {
  let body =
    "{
      \"did\": \"did:plc:abc\",
      \"handle\": \"alice.bsky.social\",
      \"displayName\": \"Alice\"
    }"
  let #(send, read_back) = mock_send(body, 200)
  let client =
    rocksky.new()
    |> rocksky.with_base_url("https://api.example.com")
    |> rocksky.with_bearer_token("test-token")
    |> rocksky.with_send(send)

  let assert Ok(profile) =
    actor.get_profile(did: "alice.bsky.social")
    |> rocksky.send(client)

  profile.handle |> should.equal(Some("alice.bsky.social"))

  let assert [req, ..] = read_back()
  req.method |> should.equal(Get)
  req.path |> should.equal("/xrpc/app.rocksky.actor.getProfile")
  req.query |> should.equal(Some("did=alice.bsky.social"))
  has_header(req, "authorization", "Bearer test-token") |> should.be_true
  has_header(req, "accept", "application/json") |> should.be_true
}

pub fn chained_params_serialise_in_pipe_order_test() {
  let #(send, read_back) = mock_send("{\"scrobbles\":[]}", 200)
  let client = rocksky.new() |> rocksky.with_send(send)

  let assert Ok(_) =
    actor.get_actor_scrobbles(did: "alice.bsky.social")
    |> rocksky.limit(50)
    |> rocksky.offset(10)
    |> rocksky.send(client)

  let assert [req, ..] = read_back()
  req.method |> should.equal(Get)
  req.path |> should.equal("/xrpc/app.rocksky.actor.getActorScrobbles")
  // Order: required first, then params added later in the pipe.
  req.query
  |> should.equal(Some("did=alice.bsky.social&limit=50&offset=10"))
}

pub fn get_stories_with_feed_and_following_test() {
  let #(send, read_back) = mock_send("{\"stories\":[]}", 200)
  let client = rocksky.new() |> rocksky.with_send(send)

  let assert Ok(_) =
    feed.get_stories()
    |> rocksky.int_param("size", 10)
    |> rocksky.param(
      "feed",
      "at://did:plc:abc/app.rocksky.feed.generator/metalcore",
    )
    |> rocksky.bool_param("following", True)
    |> rocksky.send(client)

  let assert [req, ..] = read_back()
  req.path |> should.equal("/xrpc/app.rocksky.feed.getStories")
  let assert Some(q) = req.query
  string.contains(q, "size=10") |> should.be_true
  string.contains(q, "feed=at%3A%2F%2F") |> should.be_true
  string.contains(q, "following=true") |> should.be_true
}

pub fn per_request_header_is_sent_test() {
  let #(send, read_back) = mock_send("{}", 200)
  let client = rocksky.new() |> rocksky.with_send(send)

  let assert Ok(_) =
    actor.get_profile(did: "alice")
    |> rocksky.header("x-trace-id", "abc-123")
    |> rocksky.send(client)

  let assert [req, ..] = read_back()
  has_header(req, "x-trace-id", "abc-123") |> should.be_true
}

pub fn create_scrobble_posts_json_body_test() {
  let body =
    "{
      \"id\": \"sc_1\",
      \"title\": \"Karma Police\",
      \"artist\": \"Radiohead\",
      \"album\": \"OK Computer\"
    }"
  let #(send, read_back) = mock_send(body, 200)
  let client =
    rocksky.new()
    |> rocksky.with_base_url("https://api.example.com")
    |> rocksky.with_bearer_token("token")
    |> rocksky.with_send(send)

  let assert Ok(view) =
    scr.new_scrobble(title: "Karma Police", artist: "Radiohead")
    |> scr.with_album("OK Computer")
    |> scr.with_duration_ms(263_000)
    |> scr.create
    |> rocksky.send(client)

  view.title |> should.equal(Some("Karma Police"))

  let assert [req, ..] = read_back()
  req.method |> should.equal(Post)
  req.path |> should.equal("/xrpc/app.rocksky.scrobble.createScrobble")
  has_header(req, "content-type", "application/json") |> should.be_true
  string.contains(req.body, "\"title\":\"Karma Police\"") |> should.be_true
  string.contains(req.body, "\"artist\":\"Radiohead\"") |> should.be_true
  string.contains(req.body, "\"album\":\"OK Computer\"") |> should.be_true
  string.contains(req.body, "\"duration\":263000") |> should.be_true
}

pub fn xrpc_error_response_is_parsed_test() {
  let body = "{\"error\":\"InvalidRequest\",\"message\":\"bad did\"}"
  let #(send, _) = mock_send(body, 400)
  let client = rocksky.new() |> rocksky.with_send(send)

  let result =
    actor.get_profile(did: "garbage")
    |> rocksky.send(client)

  case result {
    Error(error.XrpcError(status: 400, name: "InvalidRequest", message: m)) ->
      m |> should.equal(Some("bad did"))
    _ -> should.fail()
  }
}

pub fn http_error_without_xrpc_body_is_preserved_test() {
  let #(send, _) = mock_send("server on fire", 500)
  let client = rocksky.new() |> rocksky.with_send(send)
  let result =
    actor.get_profile(did: "alice")
    |> rocksky.send(client)
  case result {
    Error(error.HttpStatusError(status: 500, body: "server on fire")) -> Nil
    _ -> should.fail()
  }
}

pub fn transport_error_is_surfaced_test() {
  let send = fn(_req: HttpRequest(String)) -> Result(
    response.Response(String),
    String,
  ) {
    Error("dns failed")
  }
  let client = rocksky.new() |> rocksky.with_send(send)
  let result =
    actor.get_profile(did: "alice")
    |> rocksky.send(client)
  case result {
    Error(error.TransportError(message: "dns failed")) -> Nil
    _ -> should.fail()
  }
}

// ----- helpers --------------------------------------------------------------

fn has_header(
  req: HttpRequest(String),
  name: String,
  value: String,
) -> Bool {
  req.headers
  |> list.any(fn(h) {
    let #(n, v) = h
    n == name && v == value
  })
}

// Per-process request capture via the Erlang process dictionary. gleeunit
// spawns each test in its own process, so a fixed key is safe.

@external(erlang, "rocksky_test_ffi", "push_request")
fn push_request(req: HttpRequest(String)) -> Nil

@external(erlang, "rocksky_test_ffi", "read_requests")
fn read_requests() -> List(HttpRequest(String))

@external(erlang, "rocksky_test_ffi", "clear_requests")
fn clear_requests() -> Nil
