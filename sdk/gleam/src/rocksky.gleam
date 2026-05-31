//// Rocksky — a Gleam SDK for the Rocksky XRPC API.
////
//// The API is pipe-friendly: build a `Request(a)` with the relevant
//// endpoint constructor, chain param functions on it, then hand it to
//// `send` together with a `Client`.
////
//// ```gleam
//// import rocksky
//// import rocksky/actor
////
//// pub fn main() {
////   let client =
////     rocksky.new()
////     |> rocksky.with_bearer_token("xxx")
////
////   let assert Ok(profile) =
////     actor.get_profile(did: "alice.bsky.social")
////     |> rocksky.send(client)
////
////   let assert Ok(scrobbles) =
////     actor.get_actor_scrobbles(did: "alice.bsky.social")
////     |> rocksky.limit(50)
////     |> rocksky.offset(0)
////     |> rocksky.send(client)
//// }
//// ```

import gleam/dynamic/decode.{type Decoder}
import gleam/http.{Get, Post}
import gleam/http/request.{type Request as HttpRequest}
import gleam/http/response.{type Response as HttpResponse}
import gleam/httpc
import gleam/int
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky/error.{type RocksyError}
import rocksky/internal/query

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// The signature of the transport function used by the client. Swap your own
/// in via `with_send` to test offline or to target a different runtime
/// (e.g. JavaScript via a fetch-backed function).
pub type SendFn =
  fn(HttpRequest(String)) -> Result(HttpResponse(String), String)

/// A configured Rocksky client. Build one with `new()` and tweak it via the
/// `with_*` setters before passing it to `send`.
pub opaque type Client {
  Client(
    base_url: String,
    token: Option(String),
    user_agent: String,
    extra_headers: List(#(String, String)),
    send: SendFn,
  )
}

/// The public Rocksky API endpoint.
pub const default_base_url: String = "https://api.rocksky.app"

/// The default User-Agent header value sent by the SDK.
pub const default_user_agent: String = "rocksky-gleam/0.1.0"

/// Build a fresh client targeting `default_base_url` with no authentication.
pub fn new() -> Client {
  Client(
    base_url: default_base_url,
    token: None,
    user_agent: default_user_agent,
    extra_headers: [],
    send: default_send,
  )
}

/// Point the client at a different deployment. Trailing slashes are trimmed.
pub fn with_base_url(client: Client, url: String) -> Client {
  Client(..client, base_url: trim_trailing_slash(url))
}

/// Attach a Bluesky session token (sent as `Authorization: Bearer <token>`).
pub fn with_bearer_token(client: Client, token: String) -> Client {
  Client(..client, token: Some(token))
}

/// Remove any previously-set bearer token.
pub fn without_token(client: Client) -> Client {
  Client(..client, token: None)
}

/// Override the User-Agent header. Identify your app, please.
pub fn with_user_agent(client: Client, user_agent: String) -> Client {
  Client(..client, user_agent: user_agent)
}

/// Add a header that ships with every request from this client.
/// To attach a header to a single request, use `header` on the request value.
pub fn with_header(client: Client, name: String, value: String) -> Client {
  Client(..client, extra_headers: [#(name, value), ..client.extra_headers])
}

/// Replace the transport function. Mostly useful for tests and for JS
/// targets where you want to plug in a custom fetch.
pub fn with_send(client: Client, send: SendFn) -> Client {
  Client(..client, send: send)
}

/// Expose the configured base URL (e.g. for logging or sharing config).
pub fn base_url(client: Client) -> String {
  client.base_url
}

// ---------------------------------------------------------------------------
// Request(a) — the unified builder
// ---------------------------------------------------------------------------

type Method {
  QueryMethod
  ProcedureMethod
}

/// A configured but unsent XRPC call. `a` is the type of the decoded response.
/// Build one with `query` or `procedure` (or via an endpoint module), refine
/// it with chained param helpers, then execute it with `send`.
pub opaque type Request(a) {
  Request(
    method: Method,
    nsid: String,
    params: List(#(String, String)),
    headers: List(#(String, String)),
    body: Option(Json),
    decoder: Decoder(a),
  )
}

/// Start building a query (HTTP GET) against `/xrpc/{nsid}`. Endpoint modules
/// call this; you only need it directly to reach an XRPC method the SDK
/// hasn't surfaced yet.
pub fn query(nsid: String, decoder: Decoder(a)) -> Request(a) {
  Request(
    method: QueryMethod,
    nsid: nsid,
    params: [],
    headers: [],
    body: None,
    decoder: decoder,
  )
}

/// Start building a procedure (HTTP POST). See `query` for usage notes.
pub fn procedure(nsid: String, decoder: Decoder(a)) -> Request(a) {
  Request(
    method: ProcedureMethod,
    nsid: nsid,
    params: [],
    headers: [],
    body: None,
    decoder: decoder,
  )
}

/// Attach a JSON body to a request. Procedures often need this.
pub fn body(req: Request(a), body: Json) -> Request(a) {
  Request(..req, body: Some(body))
}

// ----- chainable param helpers ---------------------------------------------

/// Add a single string query parameter.
pub fn param(req: Request(a), name: String, value: String) -> Request(a) {
  Request(..req, params: [#(name, value), ..req.params])
}

/// Add a single integer query parameter (stringified at send time).
pub fn int_param(req: Request(a), name: String, value: Int) -> Request(a) {
  param(req, name, int.to_string(value))
}

/// Add a single boolean query parameter (`true` / `false`).
pub fn bool_param(req: Request(a), name: String, value: Bool) -> Request(a) {
  let s = case value {
    True -> "true"
    False -> "false"
  }
  param(req, name, s)
}

/// Add a query parameter repeated once per value (XRPC convention for
/// array-typed parameters, e.g. `getFollowers?dids=did:plc:a&dids=did:plc:b`).
pub fn repeated_param(
  req: Request(a),
  name: String,
  values: List(String),
) -> Request(a) {
  list.fold(values, req, fn(r, v) { param(r, name, v) })
}

/// Attach a header to just this request (in addition to any defaults the
/// client sets).
pub fn header(req: Request(a), name: String, value: String) -> Request(a) {
  Request(..req, headers: [#(name, value), ..req.headers])
}

// ----- named conveniences --------------------------------------------------
// These are aliases for the common params shared across many endpoints, so
// callers don't have to remember the lexicon's exact field names.

pub fn limit(req: Request(a), n: Int) -> Request(a) {
  int_param(req, "limit", n)
}

pub fn offset(req: Request(a), n: Int) -> Request(a) {
  int_param(req, "offset", n)
}

pub fn cursor(req: Request(a), c: String) -> Request(a) {
  param(req, "cursor", c)
}

pub fn start_date(req: Request(a), date: String) -> Request(a) {
  param(req, "startDate", date)
}

pub fn end_date(req: Request(a), date: String) -> Request(a) {
  param(req, "endDate", date)
}

pub fn genre(req: Request(a), g: String) -> Request(a) {
  param(req, "genre", g)
}

pub fn year(req: Request(a), y: Int) -> Request(a) {
  int_param(req, "year", y)
}

pub fn size(req: Request(a), n: Int) -> Request(a) {
  int_param(req, "size", n)
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/// Send a request through the client and decode the response.
pub fn send(req: Request(a), client: Client) -> Result(a, RocksyError) {
  let url = client.base_url <> "/xrpc/" <> req.nsid <> query.encode(req.params)
  case request.to(url) {
    Error(_) ->
      Error(error.InvalidInput("Invalid XRPC URL constructed: " <> url))
    Ok(http_req) -> {
      let body_str = case req.body {
        Some(j) -> json.to_string(j)
        None -> ""
      }
      let http_method = case req.method {
        QueryMethod -> Get
        ProcedureMethod -> Post
      }
      let http_req =
        http_req
        |> request.set_method(http_method)
        |> apply_default_headers(client)
        |> apply_request_headers(req.headers)
        |> maybe_set_content_type(req.body)
        |> request.set_body(body_str)

      http_req
      |> client.send
      |> result.map_error(error.TransportError)
      |> result.try(fn(resp) { handle_response(resp, req.decoder) })
    }
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

fn apply_default_headers(
  req: HttpRequest(String),
  client: Client,
) -> HttpRequest(String) {
  let req =
    req
    |> request.set_header("accept", "application/json")
    |> request.set_header("user-agent", client.user_agent)
  let req = case client.token {
    Some(t) -> request.set_header(req, "authorization", "Bearer " <> t)
    None -> req
  }
  list.fold(client.extra_headers, req, fn(acc, h) {
    let #(name, value) = h
    request.set_header(acc, name, value)
  })
}

fn apply_request_headers(
  req: HttpRequest(String),
  headers: List(#(String, String)),
) -> HttpRequest(String) {
  list.fold(headers, req, fn(acc, h) {
    let #(name, value) = h
    request.set_header(acc, name, value)
  })
}

fn maybe_set_content_type(
  req: HttpRequest(String),
  body: Option(Json),
) -> HttpRequest(String) {
  case body {
    Some(_) -> request.set_header(req, "content-type", "application/json")
    None -> req
  }
}

fn handle_response(
  resp: HttpResponse(String),
  decoder: Decoder(a),
) -> Result(a, RocksyError) {
  case resp.status {
    s if s >= 200 && s < 300 -> decode_body(resp.body, decoder)
    s -> Error(parse_error_body(s, resp.body))
  }
}

fn decode_body(body: String, decoder: Decoder(a)) -> Result(a, RocksyError) {
  case body {
    "" ->
      json.parse("null", decoder)
      |> result.map_error(from_json_error)
    _ ->
      json.parse(body, decoder)
      |> result.map_error(from_json_error)
  }
}

fn from_json_error(err: json.DecodeError) -> RocksyError {
  case err {
    json.UnableToDecode(errors) -> error.DecodeError(errors)
    _ -> error.InvalidInput("Server returned invalid JSON")
  }
}

fn parse_error_body(status: Int, body: String) -> RocksyError {
  let xrpc_decoder = {
    use name <- decode.field("error", decode.string)
    use message <- decode.optional_field(
      "message",
      None,
      decode.map(decode.string, Some),
    )
    decode.success(#(name, message))
  }
  case json.parse(body, xrpc_decoder) {
    Ok(#(name, message)) ->
      error.XrpcError(status: status, name: name, message: message)
    Error(_) -> error.HttpStatusError(status: status, body: body)
  }
}

fn trim_trailing_slash(url: String) -> String {
  case string.ends_with(url, "/") {
    True -> string.drop_end(url, 1)
    False -> url
  }
}

fn default_send(
  req: HttpRequest(String),
) -> Result(HttpResponse(String), String) {
  httpc.send(req)
  |> result.map_error(string.inspect)
}
