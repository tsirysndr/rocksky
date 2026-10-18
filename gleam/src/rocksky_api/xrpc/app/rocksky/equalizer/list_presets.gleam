import gleam/dynamic/decode
import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/repo_settings as repo
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

const collection = "app.rocksky.equalizer"

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.equalizer.listPresets",
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.params(req, models.list_presets_params_decoder()) {
        Error(e) -> promise.resolve(xrpc_server.fail(e))
        Ok(params) ->
          case params.did, handler.caller(req) {
            None, None ->
              promise.resolve(xrpc_server.Fail(
                401,
                "AuthRequired",
                "Provide a `did` param for public access or include an auth token.",
              ))
            _, _ -> {
              let empty =
                models.ListPresetsOutput(presets: [])
                |> models.encode_list_presets_output
              let options =
                handler.options("listPresets")
                |> handler.no_retry
                |> handler.on_error(handler.Fallback(empty))
              use <- handler.run(options)
              use did <- task.then(repo.actor(
                ctx,
                params.did,
                handler.caller(req),
              ))
              use agent <- task.then(repo.reader(ctx, did))
              use presets <- task.map(pages(agent, did, None, []))
              models.ListPresetsOutput(
                presets: list.sort(presets, fn(a, b) {
                  string.compare(a.name, b.name)
                }),
              )
              |> models.encode_list_presets_output
            }
          }
      }
    },
  )
}

fn pages(agent: atp.Agent, did: String, cursor, found) {
  use page <- task.then(
    task.attempt_result(atp.list_records(
      agent,
      did,
      collection,
      100,
      cursor,
      False,
    )),
  )
  let presets =
    list.filter_map(page.records, fn(r) {
      case decode.run(r.value, models.equalizer_record_decoder()) {
        Error(e) -> Error(e)
        Ok(p) ->
          Ok(models.EqualizerPresetView(
            uri: r.uri,
            rkey: atp.rkey_of(r.uri),
            name: p.name,
            precut: p.precut,
            bands: p.bands,
            created_at: p.created_at,
            updated_at: p.updated_at,
          ))
      }
    })
  let found = list.append(found, presets)
  case page.cursor, list.length(found) < 500 {
    Some(_), True -> pages(agent, did, page.cursor, found)
    _, _ -> task.ok(found)
  }
}
