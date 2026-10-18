import gleam/javascript/promise
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/repo_settings as repo
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

const collection = "app.rocksky.rockbox.audio.settings"

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.rockbox.getAudioSettings",
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.params(req, models.get_audio_settings_params_decoder()) {
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
              let empty = models.new_rockbox_settings_view(repo.now())
              let options =
                handler.options("getAudioSettings")
                |> handler.no_retry
                |> handler.on_error(
                  handler.Fallback(models.encode_rockbox_settings_view(empty)),
                )
              use <- handler.run(options)
              use did <- task.then(repo.actor(
                ctx,
                params.did,
                handler.caller(req),
              ))
              use agent <- task.then(repo.reader(ctx, did))
              use existing <- task.map(repo.existing(
                agent,
                did,
                collection,
                "self",
              ))
              repo.decoded(existing, models.rockbox_settings_view_decoder())
              |> option.unwrap(empty)
              |> models.encode_rockbox_settings_view
            }
          }
      }
    },
  )
}
