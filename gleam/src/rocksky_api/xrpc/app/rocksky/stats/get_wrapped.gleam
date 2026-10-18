import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/time/calendar
import gleam/time/duration
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, asc, desc, eq, eq_columns, field, from, gte, in_array, inner_join,
  lt, map, nullable, one, or, order_by, pair, required, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/js
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/stats/wrapped_query
import rocksky_api/xrpc/handler

pub type Window {
  Window(year: Int, period: String, start: Timestamp, end: Timestamp)
}

pub fn normalize_period(period: Option(String)) {
  case period {
    Some("3months") -> "3months"
    Some("month") -> "month"
    Some("2weeks") -> "2weeks"
    Some("week") -> "week"
    _ -> "year"
  }
}

pub fn period_window(period: String, year: Option(Int), now: Timestamp) {
  let #(date, time) = timestamp.to_calendar(now, calendar.utc_offset)
  case period {
    "year" -> {
      let #(local, _) = timestamp.to_calendar(now, calendar.local_offset())
      let year = option.unwrap(year, local.year)
      let start =
        timestamp.from_calendar(
          calendar.Date(year, calendar.January, 1),
          calendar.TimeOfDay(0, 0, 0, 0),
          calendar.utc_offset,
        )
      let end =
        timestamp.from_calendar(
          calendar.Date(year + 1, calendar.January, 1),
          calendar.TimeOfDay(0, 0, 0, 0),
          calendar.utc_offset,
        )
      Window(year, period, start, end)
    }
    "month" | "3months" -> {
      let delta = case period {
        "month" -> 1
        _ -> 3
      }
      let month = calendar.month_to_int(date.month) - delta
      let #(year, month) = case month < 1 {
        True -> #(date.year - 1, month + 12)
        False -> #(date.year, month)
      }
      let month =
        calendar.month_from_int(month) |> result.unwrap(calendar.January)
      let start =
        timestamp.from_calendar(
          calendar.Date(year, month, 1),
          time,
          calendar.utc_offset,
        )
        |> timestamp.add(duration.seconds({ date.day - 1 } * 86_400))
      Window(date.year, period, start, now)
    }
    _ ->
      Window(
        date.year,
        period,
        timestamp.subtract(
          now,
          duration.seconds(case period {
            "2weeks" -> 14 * 86_400
            _ -> 7 * 86_400
          }),
        ),
        now,
      )
  }
}

pub fn longest_streak(dates: List(String)) {
  let #(_, _, longest) =
    list.fold(dates, #(None, 0, 0), fn(acc, date) {
      let parsed =
        timestamp.parse_rfc3339(date <> "T00:00:00Z")
        |> option.from_result
        |> option.map(row.to_unix_ms)
      let current = case acc.0, parsed {
        Some(a), Some(b) if b - a == 86_400_000 -> acc.1 + 1
        _, _ -> 1
      }
      #(parsed, current, int.max(current, acc.2))
    })
  longest
}

pub fn default_wrapped(window: Window) {
  models.StatsWrappedView(
    year: Some(window.year),
    period: Some(window.period),
    start_date: Some(row.iso8601(window.start)),
    end_date: Some(row.iso8601(window.end)),
    total_scrobbles: Some(0),
    total_listening_time_minutes: Some(0),
    top_artists: Some([]),
    top_tracks: Some([]),
    top_albums: Some([]),
    top_genres: Some([]),
    scrobbles_per_month: Some([]),
    scrobbles_per_day: Some([]),
    most_active_day: None,
    most_active_hour: None,
    new_artists_count: Some(0),
    longest_streak: Some(0),
    first_scrobble: None,
    last_scrobble: None,
  )
}

fn milestone(ctx: Context, user_id: String, window: Window, last: Bool) {
  let scrobbles = sc.table()
  let tracks = t.table()
  select(
    scrobbles,
    pair(
      pair(field("title", t.title(tracks)), field("artist", t.artist(tracks))),
      pair(field("at", sc.timestamp(scrobbles)), field("uri", t.uri(tracks))),
    )
      |> map(fn(v) {
        models.StatsWrappedMilestone(
          Some(v.0.0),
          Some(v.0.1),
          Some(row.iso8601(v.1.0)),
          v.1.1,
        )
      }),
  )
  |> inner_join(
    tracks,
    eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
  )
  |> where(
    and([
      eq(sc.user_id(scrobbles), Some(user_id)),
      gte(sc.timestamp(scrobbles), window.start),
      lt(sc.timestamp(scrobbles), window.end),
    ]),
  )
  |> order_by([
    case last {
      True -> desc(sc.timestamp(scrobbles))
      False -> asc(sc.timestamp(scrobbles))
    },
  ])
  |> one(ctx.read_db)
}

pub fn retrieve(ctx: Context, did: String, window: Window) {
  let users = u.table()
  use user_id <- task.then(
    select(users, field("id", u.id(users)))
    |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
    |> one(ctx.read_db),
  )
  case user_id {
    None -> task.ok(default_wrapped(window))
    Some(id) -> {
      use data <- task.then(task.all3(
        wrapped_query.query(id, window.start, window.end)
          |> required(ctx.read_db, "Wrapped summary missing"),
        milestone(ctx, id, window, False),
        milestone(ctx, id, window, True),
      ))
      let summary = data.0
      let tracks = t.table()
      let artists = ar.table()
      let albums = al.table()
      let track_ids =
        list.filter_map(summary.top_tracks, fn(p) { option.to_result(p.0, Nil) })
      let artist_ids = list.map(summary.top_artists, fn(p) { p.0 })
      let album_ids =
        list.filter_map(summary.top_albums, fn(p) { option.to_result(p.0, Nil) })
      use details <- task.map(
        task.all3(
          case track_ids {
            [] -> task.ok([])
            _ ->
              from(tracks)
              |> where(in_array(t.id(tracks), track_ids))
              |> all(ctx.read_db)
          },
          case artist_ids {
            [] -> task.ok([])
            _ ->
              from(artists)
              |> where(in_array(ar.id(artists), artist_ids))
              |> all(ctx.read_db)
          },
          case album_ids {
            [] -> task.ok([])
            _ ->
              from(albums)
              |> where(in_array(al.id(albums), album_ids))
              |> all(ctx.read_db)
          },
        ),
      )
      let top_tracks =
        list.filter_map(summary.top_tracks, fn(p) {
          use track <- result.map(
            list.find(details.0, fn(t) { Some(t.id) == p.0 }),
          )
          models.StatsWrappedTrack(
            Some(track.id),
            Some(track.title),
            Some(track.artist),
            track.album_art,
            track.uri,
            track.artist_uri,
            track.album_uri,
            Some(p.1),
          )
        })
      let top_artists =
        list.filter_map(summary.top_artists, fn(p) {
          use artist <- result.map(list.find(details.1, fn(a) { a.id == p.0 }))
          models.StatsWrappedArtist(
            Some(artist.id),
            Some(artist.name),
            artist.picture,
            artist.uri,
            Some(p.1),
          )
        })
      let top_albums =
        list.filter_map(summary.top_albums, fn(p) {
          use album <- result.map(
            list.find(details.2, fn(a) { Some(a.id) == p.0 }),
          )
          models.StatsWrappedAlbum(
            Some(album.id),
            Some(album.title),
            Some(album.artist),
            album.album_art,
            album.uri,
            Some(p.1),
          )
        })
      let daily =
        list.map(summary.daily, fn(p) {
          models.StatsWrappedDayCount(Some(p.0), Some(p.1))
        })
      let active =
        list.sort(summary.daily, fn(a, b) { int.compare(b.1, a.1) })
        |> list.first
        |> option.from_result
        |> option.map(fn(p) {
          models.StatsWrappedDayCount(Some(p.0), Some(p.1))
        })
      models.StatsWrappedView(
        ..default_wrapped(window),
        total_scrobbles: Some(summary.total_scrobbles),
        total_listening_time_minutes: Some(summary.total_time / 60_000),
        top_tracks: Some(top_tracks),
        top_artists: Some(top_artists),
        top_albums: Some(top_albums),
        top_genres: Some(
          list.map(summary.top_genres, fn(p) {
            models.StatsWrappedGenreCount(p.0, Some(p.1))
          }),
        ),
        scrobbles_per_day: Some(daily),
        scrobbles_per_month: Some(
          list.map(summary.months, fn(p) {
            models.StatsWrappedMonthCount(Some(p.0), Some(p.1))
          }),
        ),
        most_active_day: active,
        most_active_hour: list.first(summary.hours)
          |> option.from_result
          |> option.map(fn(p) { p.0 }),
        new_artists_count: Some(summary.new_artists),
        first_scrobble: data.1,
        last_scrobble: data.2,
        longest_streak: Some(
          longest_streak(list.map(summary.daily, fn(p) { p.0 })),
        ),
      )
    }
  }
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  let cache = query_cache.new(1_800_000, 100)
  xrpc_server.method(server, "app.rocksky.stats.getWrapped", None, fn(req) {
    case handler.params(req, models.get_wrapped_params_decoder()) {
      Error(e) ->
        promise.resolve(xrpc_server.invalid_request(error.to_string(e)))
      Ok(params) -> {
        let period = normalize_period(params.period)
        let window =
          period_window(period, params.year, row.from_unix_ms(js.now_ms()))
        let key =
          json.object([
            #("did", json.string(params.did)),
            #("period", json.string(period)),
            #("year", case period {
              "year" -> json.int(window.year)
              _ -> json.null()
            }),
          ])
          |> json.to_string
        handler.run(
          handler.options("getWrapped")
            |> handler.timeout(120_000)
            |> handler.on_error(
              handler.Fallback(
                models.encode_stats_wrapped_view(default_wrapped(window)),
              ),
            ),
          fn() {
            query_cache.get(cache, key, fn() {
              retrieve(ctx, params.did, window)
            })
            |> task.map(models.encode_stats_wrapped_view)
          },
        )
      }
    }
  })
}
