import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/json_value.{type JsonValue, Object, String}
import rocksky_api/lib/navidrome
import rocksky_api/library/playlist_mirror as mirror
import rocksky_api/node/js
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

fn set(object: JsonValue, name: String, value: JsonValue) {
  let fields = case object {
    Object(fields) -> fields
    _ -> []
  }
  Object(
    list.append(list.filter(fields, fn(p) { p.0 != name }), [#(name, value)]),
  )
}

fn get(object: JsonValue, name: String) {
  case object {
    Object(fields) ->
      list.key_find(fields, name) |> result.unwrap(json_value.Null)
    _ -> json_value.Null
  }
}

fn string_field(object: JsonValue, name: String) {
  case get(object, name) {
    String(v) -> Some(v)
    _ -> None
  }
}

fn pre_read(ctx: Context, method: String, params: JsonValue) {
  case method {
    "deletePlaylist" ->
      case string_field(params, "id") {
        Some(id) if id != "" -> mirror.playlist_uri_of(ctx, id)
        _ -> task.ok(None)
      }
    "updatePlaylist" ->
      case
        string_field(params, "playlistId"),
        get(params, "songIndexToRemove")
      {
        Some(id), json_value.Integer(index) if id != "" ->
          mirror.song_uri_at_index(ctx, id, index)
        _, _ -> task.ok(None)
      }
    _ -> task.ok(None)
  }
}

pub fn execute(ctx: Context, method: String, did: String, params: JsonValue) {
  use previous <- task.then(pre_read(ctx, method, params))
  use raw <- task.then(navidrome.call(
    ctx,
    method,
    did,
    json_value.encode(params),
    False,
  ))
  use body <- task.then(
    decode.run(raw, json_value.decoder())
    |> result.map_error(error.Decode("library response", _))
    |> task.from_result,
  )
  let mirror_step = case method {
    "createPlaylist" ->
      case string_field(get(body, "playlist"), "id") {
        Some(id) if id != "" ->
          Some(
            mirror.mirror_create(ctx, did, id)
            |> task.map(fn(uri) {
              set(
                body,
                "playlist",
                set(get(body, "playlist"), "uri", String(uri)),
              )
            }),
          )
        _ -> None
      }
    "updatePlaylist" ->
      case string_field(params, "playlistId") {
        Some(id) if id != "" ->
          Some(
            mirror.mirror_update(
              ctx,
              did,
              id,
              mirror.UpdateChanges(
                string_field(params, "name"),
                string_field(params, "comment"),
                string_field(params, "songIdToAdd"),
                previous,
              ),
            )
            |> task.map(fn(uri) { set(body, "uri", String(uri)) }),
          )
        _ -> None
      }
    "deletePlaylist" ->
      case previous {
        Some(uri) if uri != "" ->
          Some(mirror.mirror_delete(ctx, did, uri) |> task.map(fn(_) { body }))
        _ -> None
      }
    _ -> None
  }
  case mirror_step {
    None -> task.ok(body)
    Some(work) -> {
      use outcome <- promise.await(mirror.report_mirror(method, work))
      case outcome {
        Ok(body) -> task.ok(body)
        Error(message) -> task.ok(set(body, "atprotoError", String(message)))
      }
    }
  }
}

pub fn register(server: xrpc_server.Server, ctx: Context, method: String) {
  xrpc_server.method(
    server,
    "app.rocksky.library." <> method,
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.caller(req) {
        None ->
          promise.resolve(xrpc_server.invalid_request(
            "Missing authenticated DID.",
          ))
        Some(did) -> {
          let input =
            option.unwrap(req.input, js.coerce(json_value.encode(Object([]))))
          use outcome <- promise.map({
            use params <- task.then(
              decode.run(input, json_value.decoder())
              |> result.map_error(error.Decode("library input", _))
              |> task.from_result,
            )
            execute(ctx, method, did, params)
          })
          case outcome {
            Ok(body) -> xrpc_server.Json(json_value.encode(body))
            Error(e) -> navidrome.failure(method, e)
          }
        }
      }
    },
  )
}
