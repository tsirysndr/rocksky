import gleam/list
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, delete, eq, eq_columns, field, from, in_array,
  inner_join, one, run, select, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/user_uploads as up
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/s3
import rocksky_api/schema/user_uploads
import rocksky_api/storage/app as storage
import rocksky_api/task
import rocksky_api/typesense/library

fn resolve_user_id(ctx: Context, did: String) {
  let users = u.table()
  select(users, field("id", u.id(users)))
  |> where(eq(u.did(users), did))
  |> one(ctx.db)
  |> task.require_task("No user found for DID " <> did)
  |> task.map_error(fn(e) {
    case e {
      error.NotFound(m) -> error.Unauthorized(m)
      _ -> e
    }
  })
}

pub fn purge_uploads(
  ctx: Context,
  user_id: String,
  uploads: List(user_uploads.UserUpload),
) {
  case uploads {
    [] -> task.ok(0)
    _ -> {
      use _ <- task.then(
        task.parallel_map(uploads, fn(upload) {
          let work = {
            use provider <- task.then(storage.resolve_storage_client(
              ctx,
              user_id,
              upload.storage_provider_id,
            ))
            s3.delete_object(provider.client, provider.bucket, upload.r2_key)
            |> task.attempt_result
          }
          work
          |> task.rescue(fn(e) {
            log.warn(
              "[uploads] failed to delete object "
              <> upload.r2_key
              <> ": "
              <> error.describe(e),
            )
            task.ok(Nil)
          })
        }),
      )
      let table = up.table()
      use _ <- task.map(
        delete(table, in_array(up.id(table), list.map(uploads, fn(u) { u.id })))
        |> run(ctx.db),
      )
      list.each(uploads, fn(upload) {
        task.background(
          library.remove_library_track(ctx.typesense, upload.id),
          fn(e) { log.warn("[typesense] remove failed: " <> error.describe(e)) },
        )
      })
      list.length(uploads)
    }
  }
}

pub fn delete_uploads_for_track(ctx: Context, did: String, track_id: String) {
  use user_id <- task.then(resolve_user_id(ctx, did))
  let uploads = up.table()
  use rows <- task.then(
    from(uploads)
    |> where(
      and([eq(up.track_id(uploads), track_id), eq(up.user_id(uploads), user_id)]),
    )
    |> all(ctx.db),
  )
  purge_uploads(ctx, user_id, rows)
}

pub fn delete_uploads_for_album_id(
  ctx: Context,
  did: String,
  album_id: String,
) {
  use user_id <- task.then(resolve_user_id(ctx, did))
  let uploads = up.table()
  let albums = at.table()
  use rows <- task.then(
    select(uploads, all_columns(uploads))
    |> inner_join(albums, eq_columns(at.track_id(albums), up.track_id(uploads)))
    |> where(
      and([eq(at.album_id(albums), album_id), eq(up.user_id(uploads), user_id)]),
    )
    |> all(ctx.db),
  )
  purge_uploads(ctx, user_id, rows)
}
