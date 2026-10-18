//// Compatibility for routes that are already unfinished in the TypeScript API.
//// These preserve its responses and reads; they are not new implementations
//// of API-key management, playback, or cloud downloads.

import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/db
import rocksky_api/drizzle/orm.{all, from}
import rocksky_api/drizzle/schema/playlists
import rocksky_api/drizzle/schema/queue_tracks
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub type Behavior {
  EmptyObject
  EmptyKeys
  Metadata
  NoContent
  QueueRead
  QueueTransaction
  PlaylistTransaction
  DownloadUnavailable
}

pub fn register(
  server: Server,
  ctx: Context,
  name: String,
  behavior: Behavior,
) {
  xrpc_server.method(server, name, Some(auth.verifier(ctx)), fn(_) {
    case behavior {
      DownloadUnavailable ->
        promise.resolve(xrpc_server.Fail(
          500,
          "InternalServerError",
          "Not implemented yet",
        ))
      _ -> {
        use output <- promise.map(
          handler.run(handler.options(name), fn() {
            use _ <- task.map(case behavior {
              QueueRead ->
                from(queue_tracks.table())
                |> all(ctx.db)
                |> task.map(fn(_) { Nil })
              QueueTransaction ->
                db.transaction(ctx.db, fn(db) {
                  from(queue_tracks.table())
                  |> all(db)
                  |> task.map(fn(_) { Nil })
                })
              PlaylistTransaction ->
                db.transaction(ctx.db, fn(db) {
                  from(playlists.table()) |> all(db) |> task.map(fn(_) { Nil })
                })
              _ -> task.ok(Nil)
            })
            case behavior {
              EmptyKeys ->
                json.object([#("apikeys", json.array([], json.string))])
              Metadata -> json.object([#("metadata", json.object([]))])
              _ -> json.object([])
            }
          }),
        )
        case behavior {
          NoContent | QueueTransaction | PlaylistTransaction ->
            xrpc_server.NoContent
          _ -> output
        }
      }
    }
  })
}
