import gleam/option.{Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/repo_settings as repo
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/rockbox/merge
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

const collection = "app.rocksky.rockbox.audio.settings"

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.rockbox.putAudioSettings",
    Some(auth.verifier(ctx)),
    fn(req) {
      let fallback =
        models.new_rockbox_settings_view(repo.now())
        |> models.encode_rockbox_settings_view
      let options =
        handler.options("putAudioSettings")
        |> handler.no_retry
        |> handler.on_error(handler.Fallback(fallback))
      use input <- handler.procedure_body(
        req,
        options,
        models.put_audio_settings_input_decoder(),
      )
      use did <- task.then(task.from_result(handler.authenticated(req)))
      use agent <- task.then(agent.require(ctx, did))
      use existing <- task.then(repo.existing(agent, did, collection, "self"))
      let stored =
        repo.decoded(existing, models.rockbox_settings_view_decoder())
        |> option.unwrap(models.new_rockbox_settings_view(repo.now()))
      let record = merge.patch(input, stored, repo.now())
      let body = models.encode_rockbox_settings_view(record)
      use _ <- task.map(
        task.attempt_result(atp.put_record_unchecked(
          agent,
          did,
          collection,
          "self",
          repo.record(collection, body),
          option.then(existing, fn(r) { r.cid }),
        )),
      )
      body
    },
  )
}
