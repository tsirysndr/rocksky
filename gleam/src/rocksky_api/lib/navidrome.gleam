import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, field, one, select, where}
import rocksky_api/drizzle/schema/users
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/fetch
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(
  server: Server,
  ctx: Context,
  nsid: String,
  method: String,
  input: Bool,
  url: Bool,
  request_decoder: decode.Decoder(p),
  encode_request: fn(p) -> json.Json,
  response_decoder: decode.Decoder(r),
  encode_response: fn(r) -> json.Json,
) -> Nil {
  xrpc_server.method(server, nsid, Some(auth.verifier(ctx)), fn(req) {
    case handler.caller(req) {
      None ->
        promise.resolve(xrpc_server.Fail(
          400,
          "InvalidRequest",
          "Missing authenticated DID.",
        ))
      Some(did) -> {
        let params = case input {
          True -> handler.input(req, request_decoder)
          False -> handler.params(req, request_decoder)
        }
        case params {
          Error(e) -> promise.resolve(xrpc_server.fail(e))
          Ok(params) -> {
            use result <- promise.map({
              use payload <- task.then(call(
                ctx,
                method,
                did,
                encode_request(params),
                url,
              ))
              task.from_result(
                decode.run(payload, response_decoder)
                |> error.decode("library." <> method, _),
              )
            })
            case result {
              Ok(body) -> xrpc_server.Json(encode_response(body))
              Error(e) -> failure(method, e)
            }
          }
        }
      }
    }
  })
}

pub fn failure(method: String, e: error.Error) -> xrpc_server.Output {
  case e {
    error.Upstream(status, message) ->
      xrpc_server.Fail(status, "UpstreamFailure", message)
    error.Unauthorized(message) ->
      xrpc_server.Fail(401, "AuthenticationRequired", message)
    _ -> {
      log.error("[library." <> method <> "] " <> error.to_string(e))
      xrpc_server.Fail(
        500,
        "InternalServerError",
        "Internal error in library." <> method,
      )
    }
  }
}

pub fn call(
  ctx: Context,
  method: String,
  did: String,
  params: json.Json,
  url: Bool,
) {
  let table = users.table()
  use handle <- task.then(
    select(table, field("handle", users.handle(table)))
    |> where(eq(users.did(table), did))
    |> one(ctx.db),
  )
  use handle <- task.then(case handle {
    None -> task.fail(error.Unauthorized("No user found for DID " <> did))
    Some(handle) -> task.ok(handle)
  })
  let fields =
    js.entries(js.coerce(params))
    |> list.filter(fn(p) { p.0 != "u" && p.0 != "f" })
    |> list.map(fn(p) { #(p.0, js.coerce(p.1)) })
  let query =
    fetch.query(
      json.object([
        #("u", json.string(handle)),
        #("f", json.string("json")),
        ..fields
      ]),
    )
  use response <- task.then(
    task.attempt_result(fetch.get(
      ctx.env.navidrome_internal_url <> "/rest/" <> method <> "?" <> query,
      [#("X-Rocksky-Internal", ctx.env.navidrome_internal_secret)],
      url,
    )),
  )
  case url, response.location {
    True, Some(location) ->
      task.ok(js.coerce(json.object([#("url", json.string(location))])))
    _, _ -> {
      case
        decode.run(
          response.data,
          decode.field("subsonic-response", decode.dynamic, decode.success),
        )
      {
        Error(_) ->
          task.fail(error.Upstream(
            500,
            "Malformed navidrome response for " <> method,
          ))
        Ok(payload) -> {
          case
            decode.run(
              payload,
              decode.field("status", decode.string, decode.success),
            )
          {
            Ok("failed") -> {
              let code =
                decode.run(payload, decode.at(["error", "code"], decode.int))
                |> result.unwrap(0)
              let message =
                decode.run(
                  payload,
                  decode.at(["error", "message"], decode.string),
                )
                |> result.unwrap("Navidrome error")
              task.fail(error.Upstream(http_status(code), message))
            }
            _ ->
              case url {
                True ->
                  task.fail(error.Upstream(
                    500,
                    "No redirect URL returned for " <> method,
                  ))
                False -> task.ok(payload)
              }
          }
        }
      }
    }
  }
}

pub fn http_status(code: Int) -> Int {
  case code {
    10 -> 400
    40 | 41 -> 401
    50 -> 403
    70 -> 404
    _ -> 500
  }
}
