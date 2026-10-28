import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  type Table, aliased_field, all, all_columns, and, asc, column, count,
  count_distinct, desc, eq, eq_columns, field, group_by, inner_join, integer,
  limit as db_limit, nested, nullable, offset as db_offset, optional, or,
  order_by, pair, reference, scalar, select, subquery, text, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/users as u
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/filters

pub fn retrieve(
  ctx: Context,
  table: Table(a),
  id,
  _get_id: fn(a) -> String,
  foreign,
  metadata_filter,
  did: String,
  start,
  end,
  limit: Int,
  offset: Int,
) {
  let users = u.table()
  let scrobbles = sc.table()
  let user_id =
    select(users, field("id", nullable(u.id(users))))
    |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
    |> db_limit(1)
    |> scalar(optional(text()))
  use dates <- task.then(filters.conditions(ctx, scrobbles, None, start, end))
  let counts =
    select(
      scrobbles,
      pair(aliased_field("id", foreign), aliased_field("plays", count())),
    )
    |> where(and([eq_columns(sc.user_id(scrobbles), user_id), ..dates]))
    |> group_by([reference(foreign)])
    |> subquery("counts")
  let count_id = column(counts, "id", optional(text()))
  let plays = column(counts, "plays", integer())
  let ranked =
    select(
      counts,
      pair(aliased_field("id", count_id), aliased_field("plays", plays)),
    )
  let ranked = case metadata_filter {
    None -> ranked
    Some(condition) ->
      ranked
      |> inner_join(table, eq_columns(count_id, nullable(id)))
      |> where(condition)
  }
  let page =
    ranked
    |> order_by([desc(plays), asc(count_id)])
    |> db_limit(limit)
    |> db_offset(offset)
    |> subquery("page")
  // Count listeners only for this page, in the same database request.
  // The date filter applies to all listeners, not just the profile owner.
  let listeners =
    select(scrobbles, field("listeners", count_distinct(sc.user_id(scrobbles))))
    |> where(and([eq_columns(foreign, nullable(id)), ..dates]))
    |> scalar(integer())
  select(
    table,
    pair(
      nested("entity", all_columns(table)),
      pair(
        field("plays", column(page, "plays", integer())),
        field("listeners", listeners),
      ),
    ),
  )
  |> inner_join(
    page,
    eq_columns(nullable(id), column(page, "id", optional(text()))),
  )
  |> order_by([desc(column(page, "plays", integer())), asc(id)])
  |> all(ctx.read_db)
  |> task.map(fn(rows) {
    // Keep the tuple consumed by artists, albums and songs handlers.
    list.map(rows, fn(row) { #(row.0, row.1.0, row.1.1) })
  })
}
