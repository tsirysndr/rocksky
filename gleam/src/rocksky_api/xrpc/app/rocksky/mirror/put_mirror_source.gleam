import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, eq, from, insert, now_minus_seconds, nullable, one, returning_one, set,
  set_expression, update, where,
}
import rocksky_api/drizzle/schema/mirror_sources as m
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/repo_settings
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/notifications/service
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/mirror/view
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.mirror.putMirrorSource",
    Some(auth.verifier(ctx)),
    fn(req) {
      use input <- handler.procedure_body(
        req,
        handler.options("putMirrorSource")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.put_mirror_source_input_decoder(),
      )
      let fallback =
        models.MirrorSourceView(
          ..view.empty(input.provider),
          push_enabled: None,
        )
      use result <- task.map(
        upsert(ctx, input, handler.caller(req))
        |> task.rescue(fn(e) {
          log.error("Failed to upsert mirror source: " <> error.to_string(e))
          task.ok(fallback)
        }),
      )
      models.encode_mirror_source_view(result)
    },
  )
}

fn upsert(ctx: Context, input: models.PutMirrorSourceInput, did) {
  use _ <- task.then(case list.contains(view.providers, input.provider) {
    True -> task.ok(Nil)
    False ->
      task.fail(error.InvalidRequest("Unknown provider: " <> input.provider))
  })
  use user <- task.then(
    service.user_id(ctx, did) |> task.require_task("User not found"),
  )
  let table = m.table()
  use existing <- task.then(
    from(table)
    |> where(
      and([eq(m.user_id(table), user), eq(m.provider(table), input.provider)]),
    )
    |> one(ctx.db),
  )
  let username =
    repo_settings.prefer(
      input.external_username,
      option.then(existing, fn(r) { r.external_username }),
    )
  use _ <- task.then(
    case
      input.enabled == Some(True)
      && input.provider != "tealfm"
      && option.unwrap(username, "") == ""
    {
      True -> task.fail(error.InvalidRequest("externalUsername is required"))
      False -> task.ok(Nil)
    },
  )
  use encrypted <- task.then(case input.api_key {
    None -> task.ok(option.then(existing, fn(r) { r.encrypted_api_key }))
    Some("") -> task.ok(None)
    Some(key) ->
      task.attempt_result(crypto.secretbox_encrypt(
        key,
        ctx.env.storage_encryption_key,
      ))
      |> task.map(Some)
  })
  let enable_transition =
    input.enabled == Some(True)
    && option.map(existing, fn(r) { r.enabled }) != Some(True)
  let enabled =
    repo_settings.prefer(
      input.enabled,
      option.map(existing, fn(r) { r.enabled }),
    )
    |> option.unwrap(False)
  let push =
    repo_settings.prefer(
      input.push_enabled,
      option.then(existing, fn(r) { r.push_enabled }),
    )
  let values = [
    set(m.enabled(table), enabled),
    set(m.push_enabled(table), push),
    set(m.external_username(table), username),
    set(m.encrypted_api_key(table), encrypted),
  ]
  let values = case enable_transition {
    True -> [
      set_expression(
        m.last_scrobble_seen_at(table),
        nullable(now_minus_seconds(86_400)),
      ),
      ..values
    ]
    False -> values
  }
  use saved <- task.map(case existing {
    Some(old) ->
      update(
        table,
        [set_expression(m.updated_at(table), now_minus_seconds(0)), ..values],
        eq(m.id(table), old.id),
      )
      |> returning_one(ctx.db, "Mirror source not updated")
    None ->
      insert(table, [
        set(m.user_id(table), user),
        set(m.provider(table), input.provider),
        ..values
      ])
      |> returning_one(ctx.db, "Mirror source not created")
  })
  case
    js.try_catch(fn() {
      nats.publish(ctx.nc, "rocksky.mirror.user", input.provider <> ":" <> user)
    })
  {
    Ok(_) -> Nil
    Error(e) ->
      log.warn("[putMirrorSource] NATS publish failed: " <> js.message(e))
  }
  view.present(saved.provider, Some(saved), did, ctx.env.disabled_tealfm)
}
