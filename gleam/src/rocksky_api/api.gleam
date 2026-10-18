//// The REST service (port 8000): Hono routes, NATS subscribers, rate limiting.

import rocksky_api/users/app as users

import rocksky_api/spotify/app as spotify

import rocksky_api/opengraph/app as opengraph
import rocksky_api/uploads/app as uploads

import rocksky_api/bsky/app as bsky
import rocksky_api/storage/app as storage
import rocksky_api/webscrobbler/app as webscrobbler

import rocksky_api/access_tokens/app as access_tokens
import rocksky_api/apikeys/app as apikeys
import rocksky_api/notifications/sse
import rocksky_api/subscribers/index as subscribers

import rocksky_api/submissions/app as submissions

import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, and, desc, eq, eq_columns, field, from, inner_join,
  is_not_null, limit, nested, nullable as db_nullable, offset as db_offset, one,
  order_by, pair, required, select, where,
}
import rocksky_api/drizzle/schema/album_tracks as alt
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_tracks as art
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/env
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/auth
import rocksky_api/lib/durable_submission
import rocksky_api/lib/helpers
import rocksky_api/lib/respond
import rocksky_api/lib/scrobble_guard
import rocksky_api/lib/track
import rocksky_api/log
import rocksky_api/lovedtracks/service as lovedtracks
import rocksky_api/node/hono.{type App}
import rocksky_api/node/js
import rocksky_api/node/otel
import rocksky_api/node/process
import rocksky_api/node/pyroscope
import rocksky_api/node/redis
import rocksky_api/rest/ratelimiter
import rocksky_api/rest/upstream
import rocksky_api/schema/albums
import rocksky_api/schema/artists
import rocksky_api/schema/scrobbles
import rocksky_api/schema/tracks
import rocksky_api/task.{type Task}
import rocksky_api/telemetry/metrics
import rocksky_api/tracks/service as track_service

pub const version = "0.0.1"

pub fn main() {
  otel.start("rocksky-api", version)
  process.set_dns_ipv4_first()
  let env = env.load()
  let metrics = metrics.new()
  use started <- promise.await(context.create(env, metrics))
  case started {
    Error(e) -> {
      log.error("Failed to start: " <> error.describe(e))
      process.exit(1)
    }
    Ok(ctx) -> {
      pyroscope.start("http://localhost:4040", "rocksky-api")
      let _ = subscribers.start(ctx)
      app(ctx) |> hono.serve(8000)
      log.info("Rocksky REST API is running on port 8000")
      promise.resolve(Nil)
    }
  }
}

pub fn app(ctx: Context) -> App {
  let app = hono.new()
  app
  |> hono.route("/internal/submissions", submissions.app(ctx))
  |> hono.use_("*", ratelimiter.middleware(ctx, 1000, 30))
  |> hono.use_("*", fn(c, next) {
    otel.update_active_span(hono.method(c) <> " " <> hono.path(c), hono.path(c))
    use _ <- promise.map(next())
    None
  })
  |> hono.use_("*", fn(c, next) {
    let start = js.now_ms()
    use _ <- promise.map(next())
    let seconds = int.to_float(js.now_ms() - start) /. 1000.0
    otel.histogram_record(ctx.metrics.request_duration, seconds, [
      #("route", hono.path(c)),
      #("method", hono.method(c)),
    ])
    None
  })
  |> hono.cors()
  |> hono.route("/", bsky.app(ctx))
  |> hono.route("/apikeys", apikeys.app(ctx))
  |> hono.route("/access-tokens", access_tokens.app(ctx))
  |> hono.route("/notifications", sse.app(ctx))
  |> hono.route("/storage", storage.app(ctx))
  |> hono.route("/webscrobbler", webscrobbler.app(ctx))
  |> hono.route("/public/og", opengraph.app(ctx))
  |> hono.route("/uploads", uploads.app(ctx))
  |> hono.route("/spotify", spotify.app(ctx))
  |> hono.route("/users", users.app(ctx))
  |> root_routes(ctx)
}

fn count(ctx: Context, method: String, route: String) -> Nil {
  metrics.count_request(ctx.metrics, method, route)
}

fn int_query(c: hono.Context, name: String, default: Int) -> Int {
  case hono.query(c, name) {
    Some(v) ->
      case int.parse(v) {
        Ok(0) -> default
        Ok(n) -> n
        Error(_) -> default
      }
    None -> default
  }
}

fn root_routes(app: App, ctx: Context) -> App {
  let scrobbles_table = sc.table()
  let tracks_table = t.table()
  let users_table = u.table()
  let albums_table = al.table()
  let artists_table = ar.table()
  let artist_links = art.table()
  let album_links = alt.table()
  app
  |> hono.get("/proxy-image", fn(c) {
    case hono.query(c, "url") {
      None -> hono.respond(hono.text(c, "Missing url", 400))
      Some(url) -> {
        use r <- promise.map(hono.proxy_fetch(c, url, "image/jpeg"))
        case r {
          Ok(response) -> response
          Error(_) -> hono.text(c, "Failed to fetch image", 502)
        }
      }
    }
  })
  |> hono.get("/", fn(c) {
    hono.respond(hono.json(
      c,
      json.object([#("status", json.string("ok"))]),
      200,
    ))
  })
  |> hono.post("/now-playing", fn(c) {
    count(ctx, "POST", "/now-playing")
    let work = {
      use did <- task.then(auth.did(ctx, c))
      use user <- task.then(auth.require_user(ctx, did))
      use body <- task.then(task.attempt_result(hono.json_body(c)))
      log.debug(
        "[now-playing] received payload for "
        <> log.cyan(did)
        <> ": "
        <> js.stringify(body),
      )
      use parsed <- task.then(case track.parse(body) {
        Ok(t) -> task.ok(t)
        Error(e) -> {
          log.warn(
            "[now-playing] validation failed for "
            <> log.cyan(did)
            <> ": "
            <> error.to_string(e),
          )
          task.fail(error.InvalidRequest(
            "Invalid track data: " <> error.to_string(e),
          ))
        }
      })
      use _ <- task.then(agent.require(ctx, did))
      use blocked <- task.then(scrobble_guard.check(ctx, user.did))
      case blocked {
        Some(b) -> task.ok(Blocked(b))
        None -> {
          let key = hono.header(c, "idempotency-key")
          let too_long = case key {
            Some(k) -> string.length(k) > 512
            None -> False
          }
          case too_long {
            True -> task.fail(error.InvalidRequest("Invalid Idempotency-Key"))
            False -> {
              use submission_id <- task.map(durable_submission.enqueue(
                durable_submission.Config(
                  ctx.env.submissions_url,
                  ctx.env.submissions_secret,
                ),
                user.did,
                parsed,
                key,
                False,
              ))
              Accepted(submission_id)
            }
          }
        }
      }
    }
    use outcome <- respond.with(c, work)
    case outcome {
      Accepted(id) -> {
        hono.set_header(c, "X-Submission-Id", id)
        hono.json(c, json.object([#("status", json.string("ok"))]), 200)
      }
      Blocked(scrobble_guard.BotFlagged(did)) -> {
        log.warn("[now-playing] rejected bot-flagged account " <> log.cyan(did))
        hono.json(
          c,
          json.object([
            #("status", json.string("blocked")),
            #("error", json.string("account_flagged_as_bot")),
            #("message", json.string(scrobble_guard.bot_flagged_message())),
          ]),
          429,
        )
      }
      Blocked(scrobble_guard.RateExceeded(did, retry_after)) -> {
        log.warn(
          "[now-playing] blocked suspected bot "
          <> log.cyan(did)
          <> " — retry after "
          <> int.to_string(retry_after)
          <> "s",
        )
        hono.set_header(c, "Retry-After", int.to_string(retry_after))
        hono.json(
          c,
          json.object([
            #("status", json.string("blocked")),
            #("error", json.string("scrobble_rate_exceeded")),
            #(
              "message",
              json.string(scrobble_guard.blocked_message(retry_after)),
            ),
            #("retryAfter", json.int(retry_after)),
          ]),
          429,
        )
      }
    }
  })
  |> hono.get("/now-playing", fn(c) {
    count(ctx, "GET", "/now-playing")
    let work = {
      use token_did <- task.then(auth.optional_did(ctx, c))
      let actor = case hono.query(c, "did") {
        Some(d) -> Some(d)
        None -> token_did
      }
      use actor <- task.then(
        task.from_result(task.require(actor, "Unauthorized")) |> unauthorized,
      )
      use user <- task.then(
        auth.user_by_did_or_handle(ctx, actor)
        |> task.require_task("Unauthorized")
        |> unauthorized,
      )
      use #(now_playing, status) <- task.map(task.all2(
        task.attempt_result(redis.get(ctx.redis, "nowplaying:" <> user.did)),
        task.attempt_result(redis.get(
          ctx.redis,
          "nowplaying:" <> user.did <> ":status",
        )),
      ))
      case now_playing {
        None -> json.object([])
        Some(raw) ->
          case js.parse_json(raw) {
            Error(_) -> json.object([])
            Ok(track) -> {
              // The track frame carries the device's own transport state; only
              // fall back to the status key when it does not.
              let is_playing = case
                decode.run(track, decode.at(["is_playing"], decode.bool))
              {
                Ok(b) -> b
                Error(_) -> status == Some("1")
              }
              js.set(track, "is_playing", js.coerce(is_playing)) |> js.coerce
            }
          }
      }
    }
    respond.json(c, work)
  })
  |> hono.get("/now-playings", fn(c) {
    count(ctx, "GET", "/now-playings")
    respond.json(
      c,
      upstream.analytics(
        ctx,
        "library.getDistinctScrobbles",
        json.object([
          #(
            "pagination",
            pagination(int_query(c, "offset", 0), int_query(c, "size", 10)),
          ),
        ]),
      ),
    )
  })
  |> hono.post("/likes", fn(c) {
    count(ctx, "POST", "/likes")
    let work = {
      use did <- task.then(auth.did(ctx, c))
      use agent <- task.then(agent.require(ctx, did))
      use user <- task.then(auth.require_user(ctx, did))
      use track <- task.then(track_body(c))
      lovedtracks.like_track(ctx, track, user.id, agent)
    }
    respond.status_ok(c, work)
  })
  |> hono.delete("/likes/:sha256", fn(c) {
    count(ctx, "DELETE", "/likes/:sha256")
    let work = {
      use did <- task.then(auth.did(ctx, c))
      use agent <- task.then(agent.require(ctx, did))
      use user <- task.then(auth.require_user(ctx, did))
      lovedtracks.unlike_track(ctx, hono.param(c, "sha256"), user.id, agent)
    }
    respond.status_ok(c, work)
  })
  |> hono.get("/likes", fn(c) {
    count(ctx, "GET", "/likes")
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use rows <- task.map(lovedtracks.get_loved_tracks(
        ctx,
        user.id,
        int_query(c, "size", 10),
        int_query(c, "offset", 0),
      ))
      json.array(rows, tracks.to_json)
    }
    respond.json(c, work)
  })
  |> hono.post("/tracks", fn(c) {
    count(ctx, "POST", "/tracks")
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use track <- task.then(track_body(c))
      use agent <- task.then(agent.require(ctx, user.did))
      track_service.save_track(ctx, track, agent)
      |> task.rescue(fn(e) {
        case
          string.contains(
            error.describe(e),
            "duplicate key value violates unique constraint",
          )
        {
          True -> Nil
          False -> log.error(error.describe(e))
        }
        task.ok(Nil)
      })
    }
    respond.status_ok(c, work)
  })
  |> hono.get("/public/scrobbles", fn(c) {
    count(ctx, "GET", "/public/scrobbles")
    let size = int_query(c, "size", 10)
    let offset = int_query(c, "offset", 0)
    let work = {
      use rows <- task.map(
        select(
          scrobbles_table,
          pair(
            nested("scrobble", all_columns(scrobbles_table)),
            pair(
              nested("track", all_columns(tracks_table)),
              nested("user", all_columns(users_table)),
            ),
          ),
        )
        |> inner_join(
          tracks_table,
          eq_columns(
            sc.track_id(scrobbles_table),
            db_nullable(t.id(tracks_table)),
          ),
        )
        |> inner_join(
          users_table,
          eq_columns(
            sc.user_id(scrobbles_table),
            db_nullable(u.id(users_table)),
          ),
        )
        |> order_by([desc(sc.timestamp(scrobbles_table))])
        |> limit(size)
        |> db_offset(offset)
        |> all(ctx.db),
      )
      json.array(rows, fn(r) {
        let #(scrobble, #(track, user)) = r
        json.object([
          #("cover", json.nullable(track.album_art, json.string)),
          #("artist", json.string(track.artist)),
          #("title", json.string(track.title)),
          #("date", json.string(row.iso8601(scrobble.timestamp))),
          #("user", json.string(user.handle)),
          #("uri", json.nullable(scrobble.uri, json.string)),
          #("albumUri", json.nullable(track.album_uri, json.string)),
          #("artistUri", json.nullable(track.artist_uri, json.string)),
          #("tags", json.preprocessed_array([])),
          #("listeners", json.int(1)),
          #("sha256", json.string(track.sha256)),
          #("id", json.string(scrobble.id)),
        ])
      })
    }
    respond.json(c, work)
  })
  |> hono.get("/public/scrobbleschart", fn(c) {
    count(ctx, "GET", "/public/scrobbleschart")
    let q = hono.query(c, _)
    let work = case q("did"), q("artisturi"), q("albumuri"), q("songuri") {
      Some(did), _, _, _ ->
        upstream.analytics(
          ctx,
          "library.getScrobblesPerDay",
          json.object([#("user_did", json.string(did))]),
        )
      _, Some(artist), _, _ ->
        upstream.analytics(
          ctx,
          "library.getArtistScrobbles",
          json.object([#("artist_id", json.string(artist))]),
        )
      _, _, Some(album), _ ->
        upstream.analytics(
          ctx,
          "library.getAlbumScrobbles",
          json.object([#("album_id", json.string(album))]),
        )
      _, _, _, Some(song) -> {
        use uri <- task.then(
          case string.contains(song, "app.rocksky.scrobble") {
            False -> task.ok(song)
            True ->
              select(scrobbles_table, field("uri", t.uri(tracks_table)))
              |> inner_join(
                tracks_table,
                eq_columns(
                  sc.track_id(scrobbles_table),
                  db_nullable(t.id(tracks_table)),
                ),
              )
              |> where(eq(sc.uri(scrobbles_table), Some(song)))
              |> required(ctx.db, "Scrobble not found")
              |> task.map(option.unwrap(_, song))
          },
        )
        upstream.analytics(
          ctx,
          "library.getTrackScrobbles",
          json.object([#("track_id", json.string(uri))]),
        )
      }
      _, _, _, _ ->
        upstream.analytics(ctx, "library.getScrobblesPerDay", json.object([]))
    }
    respond.json(c, work)
  })
  |> hono.get("/scrobbles", fn(c) {
    count(ctx, "GET", "/scrobbles")
    let size = int_query(c, "size", 10)
    let offset = int_query(c, "offset", 0)
    let work = {
      use user <- task.then(auth.user(ctx, c))
      use rows <- task.map(
        select(
          scrobbles_table,
          pair(
            nested("scrobble", all_columns(scrobbles_table)),
            nested("track", all_columns(tracks_table)),
          ),
        )
        |> inner_join(
          tracks_table,
          eq_columns(
            sc.track_id(scrobbles_table),
            db_nullable(t.id(tracks_table)),
          ),
        )
        |> where(
          and([
            eq(sc.user_id(scrobbles_table), Some(user.id)),
            is_not_null(sc.uri(scrobbles_table)),
          ]),
        )
        |> order_by([desc(sc.created_at(scrobbles_table))])
        |> limit(size)
        |> db_offset(offset)
        |> all(ctx.db),
      )
      json.array(rows, fn(r) {
        json.object([
          #("scrobble", scrobbles.to_json(r.0)),
          #("track", tracks.to_json(r.1)),
        ])
      })
    }
    respond.json(c, work)
  })
  |> hono.get("/tracks", fn(c) {
    count(ctx, "GET", "/tracks")
    respond.json(
      c,
      upstream.analytics(
        ctx,
        "library.getTracks",
        json.object([
          #(
            "pagination",
            pagination(int_query(c, "offset", 0), int_query(c, "size", 100)),
          ),
        ]),
      ),
    )
  })
  |> hono.get("/albums", fn(c) {
    count(ctx, "GET", "/albums")
    respond.json(
      c,
      upstream.analytics(
        ctx,
        "library.getAlbums",
        json.object([
          #(
            "pagination",
            pagination(int_query(c, "offset", 0), int_query(c, "size", 100)),
          ),
        ]),
      ),
    )
  })
  |> hono.get("/artists", fn(c) {
    count(ctx, "GET", "/artists")
    respond.json(
      c,
      upstream.analytics(
        ctx,
        "library.getArtists",
        json.object([
          #(
            "pagination",
            pagination(int_query(c, "offset", 0), int_query(c, "size", 100)),
          ),
        ]),
      ),
    )
  })
  |> hono.get("/tracks/:sha256", fn(c) {
    count(ctx, "GET", "/tracks/:sha256")
    from(tracks_table)
    |> where(eq(t.sha256(tracks_table), hono.param(c, "sha256")))
    |> one(ctx.db)
    |> task.map(nullable(_, tracks.to_json))
    |> respond.json(c, _)
  })
  |> hono.get("/albums/:sha256", fn(c) {
    count(ctx, "GET", "/albums/:sha256")
    from(albums_table)
    |> where(eq(al.sha256(albums_table), hono.param(c, "sha256")))
    |> one(ctx.db)
    |> task.map(nullable(_, albums.to_json))
    |> respond.json(c, _)
  })
  |> hono.get("/artists/:sha256", fn(c) {
    count(ctx, "GET", "/artists/:sha256")
    from(artists_table)
    |> where(eq(ar.sha256(artists_table), hono.param(c, "sha256")))
    |> one(ctx.db)
    |> task.map(nullable(_, artists.to_json))
    |> respond.json(c, _)
  })
  |> hono.get("/artists/:sha256/tracks", fn(c) {
    count(ctx, "GET", "/artists/:sha256/tracks")
    let work = {
      use rows <- task.map(
        select(
          artist_links,
          pair(
            nested("track", all_columns(tracks_table)),
            field("name", ar.name(artists_table)),
          ),
        )
        |> inner_join(
          tracks_table,
          eq_columns(art.track_id(artist_links), t.id(tracks_table)),
        )
        |> inner_join(
          artists_table,
          eq_columns(art.artist_id(artist_links), ar.id(artists_table)),
        )
        |> where(eq(ar.sha256(artists_table), hono.param(c, "sha256")))
        |> all(ctx.db),
      )
      // artist_tracks links tracks to artists that do not credit them.
      rows
      |> list.filter(fn(r) {
        helpers.credits_artist(
          Some(r.1),
          Some({ r.0 }.artist),
          Some({ r.0 }.album_artist),
        )
      })
      |> list.map(fn(r) { r.0 })
      |> json.array(tracks.to_json)
    }
    respond.json(c, work)
  })
  |> hono.get("/albums/:sha256/tracks", fn(c) {
    count(ctx, "GET", "/albums/:sha256/tracks")
    select(album_links, all_columns(tracks_table))
    |> inner_join(
      tracks_table,
      eq_columns(alt.track_id(album_links), t.id(tracks_table)),
    )
    |> inner_join(
      albums_table,
      eq_columns(alt.album_id(album_links), al.id(albums_table)),
    )
    |> where(eq(al.sha256(albums_table), hono.param(c, "sha256")))
    |> all(ctx.db)
    |> task.map(json.array(_, tracks.to_json))
    |> respond.json(c, _)
  })
}

type NowPlayingOutcome {
  Accepted(String)
  Blocked(scrobble_guard.Blocked)
}

fn unauthorized(t: Task(a)) -> Task(a) {
  task.map_error(t, fn(_) { error.Unauthorized("Unauthorized") })
}

fn pagination(skip: Int, take: Int) -> json.Json {
  json.object([#("skip", json.int(skip)), #("take", json.int(take))])
}

fn nullable(o: Option(a), f: fn(a) -> json.Json) -> json.Json {
  json.nullable(o, f)
}

fn track_body(c: hono.Context) {
  use body <- task.then(hono.json_body(c) |> task.attempt_result)
  track.parse(body)
  |> task.from_result
  |> task.map_error(fn(e) {
    error.InvalidRequest("Invalid track data: " <> error.to_string(e))
  })
}
