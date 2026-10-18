import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  after_calendar_day, all, and, asc, calendar_day, calendar_range, column, count,
  eq, eq_columns, field, group_by, gte, inner_join, integer, lte, max, nullable,
  one, or, order_by, pair, reference, select, table, text, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/calendar
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(30_000, 200)
  let fallback = models.ChartsView(Some([])) |> models.encode_charts_view
  xrpc_server.method(
    server,
    "app.rocksky.charts.getScrobblesChart",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getScrobblesChart")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_scrobbles_chart_params_decoder(),
      )
      query_cache.get(
        cache,
        models.encode_get_scrobbles_chart_params(params) |> json.to_string,
        fn() {
          use rows <- task.map(retrieve(ctx, params))
          models.ChartsView(
            Some(
              list.map(rows, fn(r) {
                models.ChartsScrobbleViewBasic(Some(r.0), Some(r.1))
              }),
            ),
          )
          |> models.encode_charts_view
        },
      )
    },
  )
}

fn present(value) {
  value != None && value != Some("")
}

fn retrieve(ctx: Context, params: models.GetScrobblesChartParams) {
  let from = option.unwrap(params.from, calendar.months_ago_date(6))
  let to = option.unwrap(params.to, calendar.months_ago_date(0))
  let scrobbles = s.table()
  let users = u.table()
  let artists = a.table()
  let albums = al.table()
  let tracks = t.table()
  use condition <- task.then(
    case
      present(params.did),
      present(params.artisturi),
      present(params.albumuri),
      present(params.songuri)
    {
      True, _, _, _ -> {
        let did = option.unwrap(params.did, "")
        use id <- task.map(
          select(users, field("id", u.id(users)))
          |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
          |> one(ctx.read_db),
        )
        Some(case id {
          Some(id) -> eq(s.user_id(scrobbles), Some(id))
          None -> or([])
        })
      }
      _, True, _, _ -> {
        use id <- task.map(
          select(artists, field("id", a.id(artists)))
          |> where(eq(a.uri(artists), params.artisturi))
          |> one(ctx.read_db),
        )
        Some(case id {
          Some(id) -> eq(s.artist_id(scrobbles), Some(id))
          None -> or([])
        })
      }
      _, _, True, _ -> {
        use id <- task.map(
          select(albums, field("id", al.id(albums)))
          |> where(eq(al.uri(albums), params.albumuri))
          |> one(ctx.read_db),
        )
        Some(case id {
          Some(id) -> eq(s.album_id(scrobbles), Some(id))
          None -> or([])
        })
      }
      _, _, _, True -> {
        use id <- task.map(
          case
            string.contains(
              option.unwrap(params.songuri, ""),
              "app.rocksky.scrobble",
            )
          {
            True ->
              select(scrobbles, field("id", s.track_id(scrobbles)))
              |> where(eq(s.uri(scrobbles), params.songuri))
              |> one(ctx.read_db)
              |> task.map(option.flatten)
            False ->
              select(tracks, field("id", t.id(tracks)))
              |> where(eq(t.uri(tracks), params.songuri))
              |> one(ctx.read_db)
          },
        )
        Some(case id {
          Some(id) -> eq(s.track_id(scrobbles), Some(id))
          None -> or([])
        })
      }
      _, _, _, _ -> task.ok(None)
    },
  )
  let day = calendar_day(s.timestamp(scrobbles))
  let base =
    select(scrobbles, pair(field("day", day), field("count", count())))
    |> group_by([reference(day)])
    |> order_by([asc(day)])
  let range = calendar_range(s.timestamp(scrobbles), from, to)
  case condition {
    Some(condition) ->
      base |> where(and([condition, range])) |> all(ctx.read_db)
    None ->
      case present(params.genre) {
        True ->
          base
          |> inner_join(
            tracks,
            eq_columns(s.track_id(scrobbles), nullable(t.id(tracks))),
          )
          |> where(and([eq(t.genre(tracks), params.genre), range]))
          |> all(ctx.read_db)
        False -> {
          let decoder = {
            use day <- decode.field("day", decode.string)
            use count <- decode.field("count", row.int())
            decode.success(#(day, count))
          }
          let view = table("scrobbles_per_day_mv", decoder)
          let view_day = column(view, "day", text())
          use coverage <- task.then(
            select(view, field("day", max(view_day))) |> one(ctx.read_db),
          )
          let conditions = case option.flatten(coverage) {
            None -> [range]
            Some(day) -> [
              range,
              after_calendar_day(s.timestamp(scrobbles), day),
            ]
          }
          use rows <- task.map(task.all2(
            select(
              view,
              pair(
                field("day", view_day),
                field("count", column(view, "count", integer())),
              ),
            )
              |> where(and([gte(view_day, from), lte(view_day, to)]))
              |> all(ctx.read_db),
            base |> where(and(conditions)) |> all(ctx.read_db),
          ))
          list.append(rows.0, rows.1)
          |> list.sort(fn(a, b) { string.compare(a.0, b.0) })
        }
      }
  }
}
