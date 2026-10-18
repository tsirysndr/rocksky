import gleam/dict
import gleam/int
import gleam/list
import gleam/option.{Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, count_distinct, decayed_count, desc, field, group_by, in_array,
  limit, ne, not_in_array, order_by, pair, reference, select, where,
}
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/task

pub fn neighbours(ctx: Context, user: String, artists: List(String)) {
  let table = sc.table()
  use rows <- task.map(
    select(
      table,
      pair(
        field("id", sc.user_id(table)),
        field("shared", count_distinct(sc.artist_id(table))),
      ),
    )
    |> where(
      and([
        in_array(sc.artist_id(table), list.map(artists, Some)),
        ne(sc.user_id(table), Some(user)),
      ]),
    )
    |> group_by([reference(sc.user_id(table))])
    |> order_by([desc(count_distinct(sc.artist_id(table)))])
    |> limit(50)
    |> all(ctx.read_db),
  )
  rows
  |> list.filter_map(fn(r) {
    use id <- result.try(option.to_result(r.0, Nil))
    Ok(#(id, int.to_float(r.1) /. int.to_float(list.length(artists))))
  })
  |> dict.from_list
}

pub fn plays(
  ctx: Context,
  neighbours: List(String),
  excluded: List(String),
  artists: Bool,
  size: Int,
) {
  let table = sc.table()
  let column = case artists {
    True -> sc.artist_id(table)
    False -> sc.track_id(table)
  }
  let score = decayed_count(sc.timestamp(table), 0.02)
  select(
    table,
    pair(
      field("id", column),
      pair(field("user", sc.user_id(table)), field("score", score)),
    ),
  )
  |> where(
    and([
      in_array(sc.user_id(table), list.map(neighbours, Some)),
      not_in_array(column, list.take(excluded, 500) |> list.map(Some)),
    ]),
  )
  |> group_by([reference(column), reference(sc.user_id(table))])
  |> order_by([desc(score)])
  |> limit(size)
  |> all(ctx.read_db)
}

pub fn artist_scores(
  ctx: Context,
  user: String,
  heard: List(String),
  size: Int,
) {
  use similarities <- task.then(neighbours(ctx, user, heard))
  use rows <- task.map(plays(ctx, dict.keys(similarities), heard, True, size))
  list.fold(rows, dict.new(), fn(acc, row) {
    case row.0, row.1.0 {
      Some(id), Some(user) -> {
        let score = result.unwrap(dict.get(similarities, user), 0.0) *. row.1.1
        case
          !list.contains(heard, id)
          && score >. result.unwrap(dict.get(acc, id), 0.0)
        {
          True -> dict.insert(acc, id, score)
          False -> acc
        }
      }
      _, _ -> acc
    }
  })
}
