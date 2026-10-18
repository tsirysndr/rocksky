import gleam/dynamic/decode
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, from, required, where}
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lib/agent
import rocksky_api/lib/track
import rocksky_api/lovedtracks/service
import rocksky_api/node/js
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/shouts/service as shouts
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context, unlike: Bool) {
  let name = case unlike {
    True -> "app.rocksky.like.dislikeSong"
    False -> "app.rocksky.like.likeSong"
  }
  xrpc_server.method(server, name, Some(auth.verifier(ctx)), fn(req) {
    use uri <- handler.procedure_body(
      req,
      handler.options(name) |> handler.no_retry,
      decode.at(["uri"], decode.string),
    )
    use did <- task.then(task.from_result(handler.authenticated(req)))
    use user <- task.then(shouts.user(ctx, did))
    use agent <- task.then(agent.require(ctx, did))
    let tracks = t.table()
    use song <- task.then(
      from(tracks)
      |> where(eq(t.uri(tracks), Some(uri)))
      |> required(ctx.db, "Track not found"),
    )
    use _ <- task.map(case unlike {
      True -> service.unlike_track(ctx, song.sha256, user, agent)
      False -> {
        let payload =
          json.object([
            #("title", json.string(song.title)),
            #("artist", json.string(song.artist)),
            #("album", json.string(song.album)),
            #("albumArtist", json.string(song.album_artist)),
            #("albumArt", json.nullable(song.album_art, json.string)),
            #("duration", json.int(song.duration)),
            #("trackNumber", json.nullable(song.track_number, json.int)),
            #("discNumber", json.nullable(song.disc_number, json.int)),
            #("lyrics", json.nullable(song.lyrics, json.string)),
            #("composer", json.nullable(song.composer, json.string)),
          ])
        use track <- task.then(
          task.from_result(track.parse(js.coerce(payload))),
        )
        service.like_track(ctx, track, user, agent) |> task.map(fn(_) { Nil })
      }
    })
    json.object([])
  })
}
