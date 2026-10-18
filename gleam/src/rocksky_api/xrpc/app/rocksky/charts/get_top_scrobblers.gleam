import gleam/dict
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/time/timestamp as ts
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  aliased_field, all, and, asc, coalesce, column, count, count_distinct, desc,
  eq, eq_columns, field, group_by, gte, hash_text, in_array, inner_join, integer,
  integer_array, is_not_null, limit as db_limit, lt, lte, max, nested, nullable,
  offset as db_offset, one, optional, or, order_by, pair, reference, select,
  subquery, sum, table, text, timestamp, union_all, unnest_integers, value,
  where,
}
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/js
import rocksky_api/node/rsql_parser
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/profile
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(600_000, 200)
  let fallback =
    models.GetTopScrobblersOutput(Some([]))
    |> models.encode_get_top_scrobblers_output
  xrpc_server.method(
    server,
    "app.rocksky.charts.getTopScrobblers",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getTopScrobblers")
          |> handler.timeout(120_000)
          |> handler.on_error(handler.Fallback(fallback)),
        models.get_top_scrobblers_params_decoder(),
      )
      query_cache.get(
        cache,
        models.encode_get_top_scrobblers_params(params) |> json.to_string,
        fn() {
          use views <- task.map(retrieve(ctx, params))
          models.GetTopScrobblersOutput(Some(views))
          |> models.encode_get_top_scrobblers_output
        },
      )
    },
  )
}

fn view(user: models.ActorProfileViewBasic, plays, artists, tracks) {
  models.ChartsScrobblerViewBasic(
    user.id,
    user.did,
    user.handle,
    user.display_name,
    user.avatar,
    Some(plays),
    Some(artists),
    Some(tracks),
  )
}

fn date(value, default) {
  case value {
    None | Some("") -> task.ok(default)
    Some(value) ->
      task.from_result(
        rsql_parser.date(value)
        |> result.try(fn(d) {
          decode.run(d, row.timestamp()) |> result.replace_error("Invalid date")
        })
        |> result.replace_error(error.InvalidRequest("Invalid chart date")),
      )
  }
}

fn retrieve(ctx: Context, params: models.GetTopScrobblersParams) {
  let size = case option.unwrap(params.limit, 20) {
    0 -> 20
    n -> n
  }
  let start_offset = option.unwrap(params.offset, 0)
  let users = u.table()
  case
    option.unwrap(params.start_date, "") == ""
    && option.unwrap(params.end_date, "") == ""
  {
    True -> {
      let totals = table("top_scrobblers_mv", decode.dynamic)
      let plays = column(totals, "scrobbles", integer())
      use rows <- task.map(
        select(
          totals,
          pair(
            nested("user", profile.selection(users)),
            pair(
              field("plays", plays),
              pair(
                field("artists", column(totals, "artists", integer())),
                field("tracks", column(totals, "tracks", integer())),
              ),
            ),
          ),
        )
        |> inner_join(
          users,
          eq_columns(column(totals, "userId", text()), u.id(users)),
        )
        |> where(eq(u.is_bot(users), False))
        |> order_by([desc(plays), asc(u.id(users))])
        |> db_limit(size)
        |> db_offset(start_offset)
        |> all(ctx.read_db),
      )
      list.map(rows, fn(r) { view(r.0, r.1.0, r.1.1.0, r.1.1.1) })
    }
    False -> {
      use start <- task.then(date(params.start_date, ts.from_unix_seconds(0)))
      use end <- task.then(date(
        params.end_date,
        ts.from_unix_seconds(js.now_ms() / 1000),
      ))
      ranged(ctx, start, end, size, start_offset)
    }
  }
}

fn ranged(ctx: Context, start, end, size, start_offset) {
  let hourly = table("user_hour_scrobbles_mv", decode.dynamic)
  let hour = column(hourly, "hour", timestamp())
  let hour_user = column(hourly, "userId", text())
  use covered <- task.then(
    select(hourly, field("through", max(hour))) |> one(ctx.read_db),
  )
  let start_parts = ts.to_unix_seconds_and_nanoseconds(start)
  let start_ms = start_parts.0 * 1000 + start_parts.1 / 1_000_000
  let end_s = ts.to_unix_seconds_and_nanoseconds(end).0
  let cov_start_s = { start_ms + 3_599_999 } / 3_600_000 * 3600
  let mv_end_s = case option.flatten(covered) {
    None -> cov_start_s
    Some(t) -> ts.to_unix_seconds_and_nanoseconds(t).0 + 3600
  }
  let cov_end_s = int.max(cov_start_s, int.min(end_s / 3600 * 3600, mv_end_s))
  let cov_start = ts.from_unix_seconds(cov_start_s)
  let cov_end = ts.from_unix_seconds(cov_end_s)
  let in_view = and([gte(hour, cov_start), lt(hour, cov_end)])
  let scrobbles = s.table()
  let stamp = s.timestamp(scrobbles)
  let live_range =
    or([
      and([gte(stamp, start), lt(stamp, cov_start), lte(stamp, end)]),
      and([gte(stamp, cov_end), lte(stamp, end)]),
    ])
  let live_counts =
    select(
      scrobbles,
      pair(
        aliased_field("user_id", s.user_id(scrobbles)),
        aliased_field("plays", count()),
      ),
    )
    |> where(and([live_range, is_not_null(s.user_id(scrobbles))]))
    |> group_by([reference(s.user_id(scrobbles))])
  let view_counts =
    select(
      hourly,
      pair(
        aliased_field("user_id", nullable(hour_user)),
        aliased_field("plays", column(hourly, "scrobbles", integer())),
      ),
    )
    |> where(in_view)
  let legs = union_all(live_counts, view_counts) |> subquery("count_legs")
  let leg_user = column(legs, "user_id", optional(text()))
  let leg_plays = column(legs, "plays", integer())
  let counts =
    select(
      legs,
      pair(
        aliased_field("user_id", leg_user),
        aliased_field("plays", coalesce(sum(leg_plays), value(0, integer()))),
      ),
    )
    |> group_by([reference(leg_user)])
    |> subquery("totals")
  let users = u.table()
  let plays = column(counts, "plays", integer())
  use ranked <- task.then(
    select(
      counts,
      pair(nested("user", profile.selection(users)), field("plays", plays)),
    )
    |> inner_join(
      users,
      eq_columns(
        column(counts, "user_id", optional(text())),
        nullable(u.id(users)),
      ),
    )
    |> where(eq(u.is_bot(users), False))
    |> order_by([desc(plays), asc(u.id(users))])
    |> db_limit(size)
    |> db_offset(start_offset)
    |> all(ctx.read_db),
  )
  let ids = list.filter_map(ranked, fn(r) { option.to_result(r.0.id, Nil) })
  case ids {
    [] -> task.ok([])
    _ -> {
      let live_keys =
        select(
          scrobbles,
          pair(
            aliased_field("user_id", s.user_id(scrobbles)),
            pair(
              aliased_field("artist", hash_text(s.artist_id(scrobbles))),
              aliased_field("track", hash_text(s.track_id(scrobbles))),
            ),
          ),
        )
        |> where(
          and([live_range, in_array(s.user_id(scrobbles), list.map(ids, Some))]),
        )
      let view_keys =
        select(
          hourly,
          pair(
            aliased_field("user_id", nullable(hour_user)),
            pair(
              aliased_field(
                "artist",
                unnest_integers(column(
                  hourly,
                  "artistKeys",
                  optional(integer_array()),
                )),
              ),
              aliased_field(
                "track",
                unnest_integers(column(
                  hourly,
                  "trackKeys",
                  optional(integer_array()),
                )),
              ),
            ),
          ),
        )
        |> where(and([in_view, in_array(hour_user, ids)]))
      let keys = union_all(live_keys, view_keys) |> subquery("keys")
      let key_user = column(keys, "user_id", optional(text()))
      use unique <- task.map(
        select(
          keys,
          pair(
            field("user", key_user),
            pair(
              field(
                "artists",
                count_distinct(column(keys, "artist", optional(integer()))),
              ),
              field(
                "tracks",
                count_distinct(column(keys, "track", optional(integer()))),
              ),
            ),
          ),
        )
        |> group_by([reference(key_user)])
        |> all(ctx.read_db),
      )
      let unique = dict.from_list(unique)
      list.map(ranked, fn(r) {
        let totals = dict.get(unique, r.0.id) |> result.unwrap(#(0, 0))
        view(r.0, r.1, totals.0, totals.1)
      })
    }
  }
}
