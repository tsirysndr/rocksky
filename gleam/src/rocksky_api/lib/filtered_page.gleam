//// Materialise selective matches before paginating, keep the recent-index
//// walk for broad predicates. Candidates must project `id` and `created_at`.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/int
import gleam/list
import rocksky_api/db/db.{type Db}
import rocksky_api/task.{type Task}

pub fn run(
  db: Db,
  candidates_sql: String,
  params: List(Dynamic),
  limit: Int,
  offset: Int,
) -> Task(List(String)) {
  use explained <- task.then(db.query(
    db,
    "EXPLAIN (FORMAT JSON) " <> candidates_sql,
    params,
  ))
  let plan_rows =
    list.first(explained)
    |> result_try(fn(row) {
      decode.run(
        row,
        decode.at(
          ["QUERY PLAN"],
          decode.list(decode.at(["Plan", "Plan Rows"], decode.float)),
        ),
      )
      |> result_replace_error(Nil)
    })
    |> result_try(fn(rows) { list.first(rows) })
  let selective = case plan_rows {
    Ok(rows) -> rows <=. 10_000.0
    Error(_) -> True
  }
  let n = list.length(params)
  let tail =
    " ORDER BY created_at DESC, id LIMIT $"
    <> int.to_string(n + 1)
    <> " OFFSET $"
    <> int.to_string(n + 2)
  let sql = case selective {
    True ->
      "WITH matches AS MATERIALIZED ("
      <> candidates_sql
      <> ") SELECT id FROM matches"
      <> tail
    False -> "SELECT id FROM (" <> candidates_sql <> ") matches" <> tail
  }
  db.all(
    db,
    sql,
    list.append(params, [dynamic.int(limit), dynamic.int(offset)]),
    decode.at(["id"], decode.string),
  )
}

fn result_try(r: Result(a, Nil), f: fn(a) -> Result(b, Nil)) -> Result(b, Nil) {
  case r {
    Ok(v) -> f(v)
    Error(_) -> Error(Nil)
  }
}

fn result_replace_error(r: Result(a, b), e: c) -> Result(a, c) {
  case r {
    Ok(v) -> Ok(v)
    Error(_) -> Error(e)
  }
}
