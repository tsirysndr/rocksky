//// ATProto client authentication policy. Key filtering is delegated to the
//// SDK; selection and negotiation are kept here in Gleam.

import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

pub const fallback_alg = "ES256"

pub type AuthMethod {
  Public
  PrivateKeyJwt(kid: String)
}

pub fn negotiate(
  method: String,
  supported_methods: List(String),
  supported_algorithms: Option(List(String)),
  signing_key_ids: Option(List(String)),
) -> Result(AuthMethod, String) {
  let algorithms = option.unwrap(supported_algorithms, [fallback_alg])
  case list.contains(supported_methods, method) {
    False ->
      Error(
        "The server does not support \""
        <> method
        <> "\" authentication. Supported methods are: "
        <> string.join(supported_methods, ", ")
        <> ".",
      )
    True ->
      case method {
        "none" -> Ok(Public)
        "private_key_jwt" ->
          case signing_key_ids {
            None -> Error("A keyset is required for private_key_jwt")
            Some(ids) ->
              case list.find(ids, fn(id) { id != "" }) {
                Ok(kid) -> Ok(PrivateKeyJwt(kid))
                Error(_) ->
                  case list.contains(algorithms, fallback_alg) {
                    True ->
                      Error(
                        "Client authentication method \"private_key_jwt\" requires at least one \"ES256\" signing key with a \"kid\" property",
                      )
                    False ->
                      Error(
                        "Authorization server requires \"private_key_jwt\" authentication method, but does not support \"ES256\" algorithm.",
                      )
                  }
              }
          }
        _ ->
          Error(
            "The ATProto OAuth spec requires that client use either \"none\" or \"private_key_jwt\" authentication method."
            <> case method {
              "client_secret_basic" ->
                " You might want to explicitly set \"token_endpoint_auth_method\" to one of those values in the client metadata document."
              _ -> " You set \"" <> method <> "\" which is not allowed."
            },
          )
      }
  }
}
