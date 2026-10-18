import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  aliased_field, all, count, count_distinct, desc, field, from, group_by,
  in_array, limit as db_limit, offset as db_offset, order_by, pair, reference,
  select, to_sql, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/lib/filtered_page
import rocksky_api/task

pub fn retrieve(
  ctx: Context,
  table,
  id,
  created,
  get_id,
  foreign,
  filter,
  rank_listeners: Bool,
  limit: Int,
  offset: Int,
) {
  let scrobbles = sc.table()
  use ids <- task.then(case filter {
    Some(condition) -> {
      let candidates =
        select(
          table,
          pair(aliased_field("id", id), aliased_field("created_at", created)),
        )
        |> where(condition)
        |> to_sql
      filtered_page.run(
        ctx.read_db,
        candidates.sql,
        candidates.params,
        limit,
        offset,
      )
    }
    None -> {
      let ranking = case rank_listeners {
        True -> count_distinct(sc.user_id(scrobbles))
        False -> count()
      }
      select(scrobbles, field("id", foreign))
      |> group_by([reference(foreign)])
      |> order_by([desc(ranking)])
      |> db_limit(limit)
      |> db_offset(offset)
      |> all(ctx.read_db)
      |> task.map(list.filter_map(_, option.to_result(_, Nil)))
    }
  })
  case ids {
    [] -> task.ok([])
    _ -> {
      use #(rows, totals) <- task.map(task.all2(
        from(table) |> where(in_array(id, ids)) |> all(ctx.read_db),
        select(
          scrobbles,
          pair(
            field("id", foreign),
            pair(
              field("plays", count()),
              field("listeners", count_distinct(sc.user_id(scrobbles))),
            ),
          ),
        )
          |> where(in_array(foreign, list.map(ids, Some)))
          |> group_by([reference(foreign)])
          |> all(ctx.read_db),
      ))
      let rows =
        rows |> list.map(fn(row) { #(get_id(row), row) }) |> dict.from_list
      let totals = dict.from_list(totals)
      list.filter_map(ids, fn(id) {
        case dict.get(rows, id) {
          Error(_) -> Error(Nil)
          Ok(row) -> {
            let counts =
              dict.get(totals, Some(id))
              |> option.from_result
              |> option.unwrap(#(0, 0))
            Ok(#(row, counts.0, counts.1))
          }
        }
      })
    }
  }
}
