import gleam/dynamic/decode
import gleam/option.{type Option}

/// Errors returned by Rocksky SDK calls.
pub type RocksyError {
  /// Underlying transport failure (DNS, TCP, TLS, etc.).
  TransportError(message: String)

  /// The server returned an HTTP status outside 2xx but did not give a
  /// well-formed XRPC error body. The raw status and body are preserved.
  HttpStatusError(status: Int, body: String)

  /// The server returned a structured XRPC error.
  XrpcError(status: Int, name: String, message: Option(String))

  /// The response body could not be decoded into the expected type.
  DecodeError(errors: List(decode.DecodeError))

  /// Some required input is missing or malformed before the call is even sent.
  InvalidInput(message: String)
}
