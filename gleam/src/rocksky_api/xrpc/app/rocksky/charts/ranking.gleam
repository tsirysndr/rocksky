import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/chart_views
import rocksky_api/drizzle/orm.{
  aliased_field, all, and, asc, column, count, count_distinct, desc, eq_columns,
  field, group_by, inner_join, integer, limit as db_limit, ne, nullable,
  offset as db_offset, optional, order_by, pair, reference, select, subquery,
  text, where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lib/helpers
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/filters

pub fn retrieve(
  ctx: Context,
  artist: Bool,
  did,
  start,
  end,
  limit: Int,
  offset: Int,
) {
  let did = helpers.non_empty(did)
  let start = helpers.non_empty(start)
  let end = helpers.non_empty(end)
  let has_filter =
    option.is_some(did) || option.is_some(start) || option.is_some(end)
  let scrobbles = sc.table()
  let artists = a.table()
  use conditions <- task.then(filters.conditions(
    ctx,
    scrobbles,
    did,
    start,
    end,
  ))
  let counts =
    case has_filter {
      False -> {
        let view = chart_views.table(artist)
        select(
          view,
          pair(
            aliased_field("id", chart_views.id(view)),
            pair(
              aliased_field("plays", chart_views.plays(view)),
              aliased_field("listeners", chart_views.listeners(view)),
            ),
          ),
        )
      }
      True -> {
        let id = case artist {
          True -> sc.artist_id(scrobbles)
          False -> sc.track_id(scrobbles)
        }
        select(
          scrobbles,
          pair(
            aliased_field("id", id),
            pair(
              aliased_field("plays", count()),
              aliased_field("listeners", count_distinct(sc.user_id(scrobbles))),
            ),
          ),
        )
        |> where(and(conditions))
        |> group_by([reference(id)])
      }
    }
    |> subquery("counts")
  let id = column(counts, "id", optional(text()))
  let plays = column(counts, "plays", integer())
  let listeners = column(counts, "listeners", integer())
  let query =
    select(
      counts,
      pair(
        field("id", id),
        pair(field("plays", plays), field("listeners", listeners)),
      ),
    )
  let query = case artist {
    True ->
      query
      |> inner_join(artists, eq_columns(id, nullable(a.id(artists))))
      |> where(ne(a.name(artists), "Various Artists"))
    False -> query
  }
  let sort = case did {
    Some(_) -> plays
    _ -> listeners
  }
  query
  |> order_by([desc(sort), asc(id)])
  |> db_limit(limit)
  |> db_offset(offset)
  |> all(ctx.read_db)
}
