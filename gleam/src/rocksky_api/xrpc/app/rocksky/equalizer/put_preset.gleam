import gleam/option.{Some}
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/repo_settings as repo
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/equalizer/slug
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

const collection = "app.rocksky.equalizer"

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.equalizer.putPreset",
    Some(auth.verifier(ctx)),
    fn(req) {
      let options =
        handler.options("putPreset")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate)
      use input <- handler.procedure_body(
        req,
        options,
        models.put_preset_input_decoder(),
      )
      use did <- task.then(task.from_result(handler.authenticated(req)))
      let rkey = slug.preset_rkey(input.name)
      use _ <- task.then(case rkey {
        "" ->
          task.fail(error.InvalidRequest(
            "Preset name \"" <> input.name <> "\" produces an empty record key",
          ))
        _ -> task.ok(Nil)
      })
      use agent <- task.then(agent.require(ctx, did))
      use existing <- task.then(repo.existing(agent, did, collection, rkey))
      let stored = repo.decoded(existing, models.equalizer_record_decoder())
      let now = repo.now()
      let record =
        models.EqualizerRecord(
          name: string.trim(input.name),
          bands: input.bands,
          precut: repo.prefer(
            input.precut,
            option.then(stored, fn(r) { r.precut }),
          ),
          created_at: option.map(stored, fn(r) { r.created_at })
            |> option.unwrap(now),
          updated_at: Some(now),
        )
      use ref <- task.map(
        task.attempt_result(atp.put_record_unchecked(
          agent,
          did,
          collection,
          rkey,
          repo.record(collection, models.encode_equalizer_record(record)),
          option.then(existing, fn(r) { r.cid }),
        )),
      )
      models.EqualizerPresetView(
        uri: ref.uri,
        rkey: rkey,
        name: record.name,
        precut: record.precut,
        bands: record.bands,
        created_at: record.created_at,
        updated_at: record.updated_at,
      )
      |> models.encode_equalizer_preset_view
    },
  )
}
