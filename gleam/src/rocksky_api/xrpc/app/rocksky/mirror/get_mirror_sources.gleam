import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{all, eq, from, where}
import rocksky_api/drizzle/schema/mirror_sources
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/notifications/service
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/mirror/view
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetMirrorSourcesOutput(list.map(view.providers, view.empty))
    |> models.encode_get_mirror_sources_output
  xrpc_server.method(
    server,
    "app.rocksky.mirror.getMirrorSources",
    Some(auth.verifier(ctx)),
    fn(req) {
      use <- handler.run(
        handler.options("getMirrorSources")
        |> handler.on_error(handler.Fallback(fallback)),
      )
      let did = handler.caller(req)
      use user <- task.then(service.user_id(ctx, did))
      use sources <- task.map(case user {
        None -> task.ok([])
        Some(id) -> {
          let table = mirror_sources.table()
          from(table)
          |> where(eq(mirror_sources.user_id(table), id))
          |> all(ctx.db)
        }
      })
      models.GetMirrorSourcesOutput(
        list.map(view.providers, fn(provider) {
          let source =
            list.find(sources, fn(r) { r.provider == provider })
            |> option.from_result
          view.present(provider, source, did, ctx.env.disabled_tealfm)
        }),
      )
      |> models.encode_get_mirror_sources_output
    },
  )
}
