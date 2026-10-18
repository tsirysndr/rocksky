import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{insert, on_conflict_do_nothing, run, set}
import rocksky_api/drizzle/schema/spotify_apps as apps
import rocksky_api/error
import rocksky_api/node/crypto
import rocksky_api/scripts/common
import rocksky_api/task

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [id, secret, ..] if id != "" && secret != "" -> {
      use encrypted <- task.then(
        crypto.aes_ctr_encrypt(
          secret,
          ctx.env.spotify_encryption_key,
          ctx.env.spotify_encryption_iv,
        )
        |> error.map_js
        |> task.from_result,
      )
      let table = apps.table()
      insert(table, [
        set(apps.spotify_app_id(table), id),
        set(apps.spotify_secret(table), encrypted),
      ])
      |> on_conflict_do_nothing
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
    }
    _ ->
      task.fail(error.InvalidRequest(
        "Usage: gleam run -m rocksky_api/scripts/spotify -- <client_id> <client_secret>",
      ))
  }
}

pub fn main() {
  common.run(execute)
}
