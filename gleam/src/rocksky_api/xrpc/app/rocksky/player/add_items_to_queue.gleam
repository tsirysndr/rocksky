import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/db
import rocksky_api/drizzle/orm.{all, from, in_array, where}
import rocksky_api/drizzle/schema/dropbox_paths as d
import rocksky_api/drizzle/schema/google_drive_paths as g
import rocksky_api/lexicon/models
import rocksky_api/node/axios
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) {
  xrpc_server.method(
    server,
    "app.rocksky.player.addItemsToQueue",
    Some(auth.verifier(ctx)),
    fn(req) {
      use _ <- promise.map(
        handler.query(
          req,
          handler.options("addItemsToQueue"),
          models.add_items_to_queue_params_decoder(),
          fn(params) {
            use did <- task.then(task.from_result(handler.authenticated(req)))
            use _ <- task.map(
              db.transaction(ctx.db, fn(db) {
                let google = g.table()
                let dropbox = d.table()
                // The source's whole-table IN operands are invalid PostgreSQL. The
                // lookups are advisory; the tracklist service receives the original URIs.
                use _ <- task.then(task.all2(
                  from(google)
                    |> where(in_array(
                      g.file_id(google),
                      list.filter(params.items, string.starts_with(
                        _,
                        "gdrive://",
                      )),
                    ))
                    |> all(db),
                  from(dropbox)
                    |> where(in_array(
                      d.file_id(dropbox),
                      list.filter(params.items, string.starts_with(
                        _,
                        "dropbox://",
                      )),
                    ))
                    |> all(db),
                ))
                axios.post(
                  ctx.tracklist,
                  "/tracklist.addTracks",
                  json.object([
                    #("did", json.string(did)),
                    #("track_ids", json.array(params.items, json.string)),
                  ]),
                  axios.default_options(),
                )
                |> task.attempt_result
              }),
            )
            json.object([])
          },
        ),
      )
      xrpc_server.NoContent
    },
  )
}
