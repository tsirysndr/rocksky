import gleam/option.{Some}
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/track.{type Track}
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/tracks/service
import rocksky_api/views/song
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn create(ctx: Context, track: Track, agent: atp.Agent) {
  use _ <- task.then(service.save_track(ctx, track, agent))
  use saved <- task.then(
    service.lookup(ctx, track)
    |> task.require_task("Track was not indexed after publication"),
  )
  case saved.uri {
    Some(uri) if uri != "" -> task.ok(song.detailed(saved))
    _ -> task.fail(error.Upstream(502, "Track publication did not complete"))
  }
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  xrpc_server.method(
    server,
    "app.rocksky.song.createSong",
    Some(auth.verifier(ctx)),
    fn(req) {
      use track <- handler.procedure_body(
        req,
        handler.options("createSong") |> handler.timeout(120_000),
        track.decoder(),
      )
      use did <- task.then(handler.authenticated(req) |> task.from_result)
      use agent <- task.then(agent.require(ctx, did))
      create(ctx, track, agent) |> task.map(models.encode_song_view_detailed)
    },
  )
}
