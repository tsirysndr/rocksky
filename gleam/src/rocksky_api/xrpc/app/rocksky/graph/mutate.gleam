import gleam/option.{None, Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, delete, eq, field, insert, on_conflict_do_nothing, one, run as db_run,
  select, set, where,
}
import rocksky_api/drizzle/schema/follows as f
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/repo_settings as repo
import rocksky_api/node/tid
import rocksky_api/notifications/service
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/graph/queries

pub fn run(ctx: Context, did: String, account: String, follow: Bool) {
  use _ <- task.then(case did == account {
    True -> task.fail(error.InvalidRequest("User cannot follow themselves"))
    False -> task.ok(Nil)
  })
  let table = f.table()
  let condition =
    and([eq(f.follower_did(table), did), eq(f.subject_did(table), account)])
  use existing <- task.then(
    select(table, field("uri", f.uri(table))) |> where(condition) |> one(ctx.db),
  )
  use _ <- task.then(case existing, follow {
    Some(_), True ->
      task.fail(error.InvalidRequest("User is already following"))
    None, False -> task.fail(error.InvalidRequest("User is not following"))
    _, _ -> task.ok(Nil)
  })
  use agent <- task.then(agent.require(ctx, did))
  use _ <- task.then(case existing, follow {
    Some(uri), False -> {
      use _ <- task.then(
        task.attempt_result(atp.delete_record(
          agent,
          did,
          "app.rocksky.graph.follow",
          atp.rkey_of(uri),
        )),
      )
      delete(table, condition) |> db_run(ctx.db) |> task.map(fn(_) { Nil })
    }
    _, _ -> {
      let record =
        models.new_follow_record(repo.now(), account)
        |> models.encode_follow_record
        |> repo.record("app.rocksky.graph.follow", _)
      use ref <- task.then(
        task.attempt_result(atp.create_record_unchecked(
          agent,
          did,
          "app.rocksky.graph.follow",
          tid.next(),
          record,
        )),
      )
      use _ <- task.then(
        insert(table, [
          set(f.uri(table), ref.uri),
          set(f.follower_did(table), did),
          set(f.subject_did(table), account),
        ])
        |> on_conflict_do_nothing
        |> db_run(ctx.db),
      )
      use #(subject, actor) <- task.then(task.all2(
        service.user_id(ctx, Some(account)),
        service.user_id(ctx, Some(did)),
      ))
      service.create(ctx, subject, actor, "follow", None, Some("at://" <> did))
      |> task.map(fn(_) { Nil })
    }
  })
  queries.page(ctx, account, 50, None, [], False, None)
}
