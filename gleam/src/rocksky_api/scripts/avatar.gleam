import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, eq, from, limit, offset, one, or, required, run, set, update, where,
}
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/bsky_profile
import rocksky_api/log
import rocksky_api/node/nats
import rocksky_api/node/process
import rocksky_api/schema/users
import rocksky_api/scripts/common
import rocksky_api/task

pub fn process_user(ctx: Context, user: users.User, skip: Bool) {
  let table = us.table()
  use _ <- task.then(case skip {
    True -> task.ok(Nil)
    False -> {
      use profile <- task.then(bsky_profile.fetch(
        ctx.env.bsky_appview_url,
        user.did,
        None,
      ))
      let fields =
        list.flatten([
          case profile.avatar {
            Some(v) -> [set(us.avatar(table), v)]
            None -> []
          },
          case profile.display_name {
            Some(v) -> [set(us.display_name(table), Some(v))]
            None -> []
          },
        ])
      case fields {
        [] -> task.ok(Nil)
        _ ->
          update(table, fields, eq(us.did(table), user.did))
          |> run(ctx.db)
          |> task.map(fn(_) { Nil })
      }
    }
  })
  use user <- task.map(
    from(table)
    |> where(eq(us.did(table), user.did))
    |> required(ctx.db, "User not found"),
  )
  nats.publish(
    ctx.nc,
    "rocksky.user",
    json.object([
      #("xata_id", json.string(user.id)),
      #("did", json.string(user.did)),
      #("handle", json.string(user.handle)),
      #("display_name", json.nullable(user.display_name, json.string)),
      #("avatar", json.string(user.avatar)),
      #("xata_createdat", json.string(row.iso8601(user.created_at))),
      #("xata_updatedat", json.string(row.iso8601(user.updated_at))),
      #("xata_version", json.nullable(user.xata_version, json.int)),
    ])
      |> json.to_string,
  )
}

fn batches(ctx: Context, start: Int, skip: Bool) {
  use users <- task.then(
    from(us.table()) |> offset(start) |> limit(100) |> all(ctx.db),
  )
  case users {
    [] -> task.ok(Nil)
    _ -> {
      use _ <- task.then(
        common.each(users, fn(user) {
          process_user(ctx, user, skip)
          |> task.rescue(fn(e) {
            log.error(
              "Error processing user " <> user.did <> ": " <> error.describe(e),
            )
            task.ok(Nil)
          })
        }),
      )
      use _ <- promise.await(task.sleep(100))
      batches(ctx, start + 100, skip)
    }
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  let skip = option.unwrap(process.env("SKIP_AVATAR_UPDATE"), "") != ""
  use _ <- task.then(case args {
    [] -> batches(ctx, 0, skip)
    _ ->
      common.each(args, fn(actor) {
        let table = us.table()
        use user <- task.then(
          from(table)
          |> where(or([eq(us.did(table), actor), eq(us.handle(table), actor)]))
          |> one(ctx.db),
        )
        case user {
          None -> {
            log.info("User " <> actor <> " not found")
            task.ok(Nil)
          }
          Some(user) -> process_user(ctx, user, skip)
        }
      })
  })
  nats.flush(ctx.nc) |> task.attempt
}

pub fn main() {
  common.run(execute)
}
