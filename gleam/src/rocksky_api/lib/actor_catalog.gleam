import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  aliased_field, all, and, asc, column, count, count_distinct, desc, eq,
  eq_columns, field, from, group_by, in_array, inner_join, integer,
  limit as db_limit, nullable, offset as db_offset, one, optional, or, order_by,
  pair, reference, select, subquery, text, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/users as u
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/filters

pub fn retrieve(
  ctx: Context,
  table,
  id,
  get_id,
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
  use user <- task.then(
    select(users, field("id", u.id(users)))
    |> where(or([eq(u.did(users), did), eq(u.handle(users), did)]))
    |> one(ctx.read_db),
  )
  case user {
    None -> task.ok([])
    Some(user_id) -> {
      use dates <- task.then(filters.conditions(
        ctx,
        scrobbles,
        None,
        start,
        end,
      ))
      let counts =
        select(
          scrobbles,
          pair(aliased_field("id", foreign), aliased_field("plays", count())),
        )
        |> where(and([eq(sc.user_id(scrobbles), Some(user_id)), ..dates]))
        |> group_by([reference(foreign)])
        |> subquery("counts")
      let count_id = column(counts, "id", optional(text()))
      let plays = column(counts, "plays", integer())
      let ranked =
        select(counts, pair(field("id", count_id), field("plays", plays)))
      let ranked = case metadata_filter {
        None -> ranked
        Some(condition) ->
          ranked
          |> inner_join(table, eq_columns(count_id, nullable(id)))
          |> where(condition)
      }
      use ranked <- task.then(
        ranked
        |> order_by([desc(plays), asc(count_id)])
        |> db_limit(limit)
        |> db_offset(offset)
        |> all(ctx.read_db),
      )
      let ids = list.filter_map(ranked, fn(r) { option.to_result(r.0, Nil) })
      case ids {
        [] -> task.ok([])
        _ -> {
          use #(rows, totals) <- task.map(task.all2(
            from(table) |> where(in_array(id, ids)) |> all(ctx.read_db),
            select(
              scrobbles,
              pair(
                field("id", foreign),
                field("listeners", count_distinct(sc.user_id(scrobbles))),
              ),
            )
              |> where(and([in_array(foreign, list.map(ids, Some)), ..dates]))
              |> group_by([reference(foreign)])
              |> all(ctx.read_db),
          ))
          let rows =
            rows |> list.map(fn(row) { #(get_id(row), row) }) |> dict.from_list
          let totals = dict.from_list(totals)
          list.filter_map(ranked, fn(r) {
            case r.0 {
              None -> Error(Nil)
              Some(id) ->
                case dict.get(rows, id) {
                  Error(_) -> Error(Nil)
                  Ok(row) ->
                    Ok(#(
                      row,
                      r.1,
                      dict.get(totals, r.0)
                        |> option.from_result
                        |> option.unwrap(0),
                    ))
                }
            }
          })
        }
      }
    }
  }
}
