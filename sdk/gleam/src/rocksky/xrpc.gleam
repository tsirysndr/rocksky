//// Raw XRPC transport and decoding helpers for the generated `rocksky/api`.
import gleam/dynamic/decode
import gleam/json
import gleam/option.{type Option, None, Some}
import gleam/result

pub opaque type Client {
  Client(endpoint: String, token: String, timeout_ms: Int)
}
pub type Method { Get Post }
pub type RawResponse { RawResponse(status: Int, body: BitArray) }
pub type Error {
  TransportError(String)
  HttpError(status: Int, body: BitArray)
  DecodeError(json.DecodeError)
}
pub fn new() -> Client {
  Client("https://api.rocksky.app", "", 30_000)
}
pub fn with_endpoint(client: Client, endpoint: String) -> Client {
  Client(..client, endpoint: endpoint)
}
pub fn with_token(client: Client, token: String) -> Client {
  Client(..client, token: token)
}
pub fn with_timeout(client: Client, timeout_ms: Int) -> Client {
  Client(..client, timeout_ms: timeout_ms)
}
@external(erlang, "rocksky_gleam_http", "request")
fn request_ffi(method: Method, endpoint: String, nsid: String, params: String, body: String, token: String, timeout: Int) -> Result(#(Int, BitArray), String)

/// Escape hatch. Preserves status and raw bytes, including non-2xx responses.
/// Query arrays become repeated URL parameters. A POST body is independent of params.
pub fn raw(client: Client, method: Method, nsid: String, params: json.Json, body: Option(json.Json)) -> Result(RawResponse, Error) {
  let body = case body { None -> "" Some(v) -> json.to_string(v) }
  request_ffi(method, client.endpoint, nsid, json.to_string(params), body, client.token, client.timeout_ms)
  |> result.map(fn(r) { RawResponse(r.0, r.1) })
  |> result.map_error(TransportError)
}
/// Custom typed call: supply your own decoder for endpoints outside the generated API.
pub fn request(client: Client, method: Method, nsid: String, params: json.Json, body: Option(json.Json), decoder: decode.Decoder(a)) -> Result(a, Error) {
  use bytes <- result.try(request_bytes(client, method, nsid, params, body))
  // Empty procedure responses decode as JSON null.
  let bytes = case bytes { <<>> -> <<"null":utf8>> _ -> bytes }
  json.parse_bits(bytes, decoder) |> result.map_error(DecodeError)
}
pub fn request_bytes(client: Client, method: Method, nsid: String, params: json.Json, body: Option(json.Json)) -> Result(BitArray, Error) {
  use response <- result.try(raw(client, method, nsid, params, body))
  case response.status >= 200 && response.status < 300 {
    True -> Ok(response.body)
    False -> Error(HttpError(response.status, response.body))
  }
}
