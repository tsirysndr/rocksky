import gleam/json
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{all, from}
import rocksky_api/drizzle/schema/loved_tracks
import rocksky_api/node/nats
import rocksky_api/scripts/common
import rocksky_api/task

pub fn execute(ctx: Context, _args) {
  use likes <- task.then(from(loved_tracks.table()) |> all(ctx.db))
  use _ <- task.then(
    common.each(likes, fn(like) {
      nats.publish(
        ctx.nc,
        "rocksky.like",
        json.object([
          #("uri", json.nullable(like.uri, json.string)),
          #("user_id", json.object([#("xata_id", json.string(like.user_id))])),
          #("track_id", json.object([#("xata_id", json.string(like.track_id))])),
          #("xata_createdat", json.string(row.iso8601(like.created_at))),
          #("xata_updatedat", json.string(row.iso8601(like.created_at))),
          #("xata_id", json.string(like.id)),
          #("xata_version", json.int(0)),
        ])
          |> json.to_string,
      )
      task.ok(Nil)
    }),
  )
  nats.flush(ctx.nc) |> task.attempt
}

pub fn main() {
  common.run(execute)
}
