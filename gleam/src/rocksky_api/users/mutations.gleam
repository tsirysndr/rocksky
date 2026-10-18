import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, delete, eq, from, insert, one, required, returning_one, run, set, where,
}
import rocksky_api/drizzle/schema/shout_reports as sr
import rocksky_api/drizzle/schema/shouts as sh
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/lib/track
import rocksky_api/lovedtracks/service as loved
import rocksky_api/node/hono
import rocksky_api/schema/shout_reports
import rocksky_api/schema/shouts
import rocksky_api/shouts/input
import rocksky_api/shouts/service
import rocksky_api/task

fn uri(c: hono.Context, kind: String) {
  "at://"
  <> hono.param(c, "did")
  <> "/app.rocksky."
  <> kind
  <> "/"
  <> hono.param(c, "rkey")
}

fn input(c: hono.Context) {
  use body <- task.then(hono.json_body(c) |> task.attempt_result)
  decode.run(body, input.decoder())
  |> error.decode("Invalid shout data", _)
  |> task.from_result
  |> task.then(fn(input) { input.validate(input) |> task.from_result })
}

fn empty(work) {
  task.map(work, fn(_) { json.object([]) })
}

fn create(ctx: Context, c: hono.Context, kind: String) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use agent <- task.then(agent.require(ctx, user.did))
    use input <- task.then(input(c))
    use subject <- task.then(case kind {
      "profile" -> {
        use target <- task.map(
          auth.user_by_did_or_handle(ctx, hono.param(c, "did"))
          |> task.require_task("User not found"),
        )
        "at://" <> target.did
      }
      _ -> task.ok(uri(c, kind))
    })
    service.create(ctx, input, subject, user.id, agent) |> empty
  }
  respond.json(c, work)
}

fn shout_action(ctx: Context, c: hono.Context, action: String) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use agent <- task.then(agent.require(ctx, user.did))
    let uri = uri(c, "shout")
    case action {
      "like" -> service.like(ctx, uri, user.id, agent) |> empty
      "unlike" -> service.unlike(ctx, uri, user.id, agent) |> empty
      "reply" -> {
        use input <- task.then(input(c))
        service.reply(ctx, input, uri, user.id, agent) |> empty
      }
      _ -> {
        let table = sh.table()
        use shout <- task.then(
          from(table)
          |> where(eq(sh.uri(table), uri))
          |> required(ctx.db, "Shout not found"),
        )
        service.remove(ctx, uri, user.id, agent)
        |> task.map(fn(_) { shouts.to_json(shout) })
      }
    }
  }
  respond.json(c, work)
}

fn track_action(ctx: Context, c: hono.Context, by_id: Bool, unlike: Bool) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    use agent <- task.then(agent.require(ctx, user.did))
    let table = tr.table()
    let condition = case by_id {
      True -> eq(tr.id(table), hono.param(c, "trackId"))
      False -> eq(tr.uri(table), Some(uri(c, "song")))
    }
    use row <- task.then(
      from(table) |> where(condition) |> required(ctx.db, "Track not found"),
    )
    case unlike {
      True ->
        loved.unlike_track(ctx, row.sha256, user.id, agent)
        |> task.map(fn(_) { json.array([], json.string) })
      False -> {
        let track =
          track.Track(
            ..track.new(row.title, row.artist, row.album, row.duration),
            album_artist: row.album_artist,
            album_art: row.album_art,
            track_number: row.track_number,
            disc_number: row.disc_number,
            composer: row.composer,
            lyrics: row.lyrics,
          )
        loved.like_track(ctx, track, user.id, agent) |> empty
      }
    }
  }
  respond.json(c, work)
}

fn report(ctx: Context, c: hono.Context, remove: Bool) {
  let work = {
    use user <- task.then(auth.user(ctx, c))
    let shouts = sh.table()
    use shout <- task.then(
      from(shouts)
      |> where(eq(sh.uri(shouts), uri(c, "shout")))
      |> required(ctx.db, "Shout not found"),
    )
    let reports = sr.table()
    use existing <- task.then(
      from(reports)
      |> where(
        and([
          eq(sr.user_id(reports), user.id),
          eq(sr.shout_id(reports), shout.id),
        ]),
      )
      |> one(ctx.db),
    )
    case remove, existing {
      True, None -> task.fail(error.NotFound("Report not found"))
      True, Some(report) ->
        delete(reports, eq(sr.id(reports), report.id))
        |> run(ctx.db)
        |> task.map(fn(_) { shout_reports.to_json(report) })
      False, Some(report) -> task.ok(shout_reports.to_json(report))
      False, None ->
        insert(reports, [
          set(sr.user_id(reports), user.id),
          set(sr.shout_id(reports), shout.id),
        ])
        |> returning_one(ctx.db, "Report insert failed")
        |> task.map(shout_reports.to_json)
    }
  }
  respond.json(c, work)
}

pub fn routes(app: hono.App, ctx: Context) {
  app
  |> hono.post("/:did/app.rocksky.artist/:rkey/shouts", create(ctx, _, "artist"))
  |> hono.post("/:did/app.rocksky.album/:rkey/shouts", create(ctx, _, "album"))
  |> hono.post("/:did/app.rocksky.song/:rkey/shouts", create(ctx, _, "song"))
  |> hono.post("/:did/app.rocksky.scrobble/:rkey/shouts", create(
    ctx,
    _,
    "scrobble",
  ))
  |> hono.post("/:did/shouts", create(ctx, _, "profile"))
  |> hono.post("/:did/app.rocksky.shout/:rkey/likes", shout_action(
    ctx,
    _,
    "like",
  ))
  |> hono.delete("/:did/app.rocksky.shout/:rkey/likes", shout_action(
    ctx,
    _,
    "unlike",
  ))
  |> hono.post("/:did/app.rocksky.shout/:rkey/replies", shout_action(
    ctx,
    _,
    "reply",
  ))
  |> hono.delete("/:did/app.rocksky.shout/:rkey", shout_action(ctx, _, "remove"))
  |> hono.post("/:did/app.rocksky.song/:rkey/likes", track_action(
    ctx,
    _,
    False,
    False,
  ))
  |> hono.delete("/:did/app.rocksky.song/:rkey/likes", track_action(
    ctx,
    _,
    False,
    True,
  ))
  |> hono.post("/tracks/:trackId/likes", track_action(ctx, _, True, False))
  |> hono.delete("/tracks/:trackId/likes", track_action(ctx, _, True, True))
  |> hono.post("/:did/app.rocksky.shout/:rkey/report", report(ctx, _, False))
  |> hono.delete("/:did/app.rocksky.shout/:rkey/report", report(ctx, _, True))
}
