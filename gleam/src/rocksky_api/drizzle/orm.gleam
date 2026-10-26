//// Typed PostgreSQL query construction backed by Drizzle's JavaScript runtime.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode.{type Decoder}
import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/db/db.{type Db}
import rocksky_api/db/param
import rocksky_api/db/row
import rocksky_api/node/js
import rocksky_api/node/pg
import rocksky_api/task.{type Task}

pub type Raw

pub type RawQuery

pub type Condition

pub type Order

pub type Assignment

pub opaque type Codec(a) {
  Codec(encode: fn(a) -> Dynamic, decode: Decoder(a))
}

pub opaque type Table(a) {
  Table(raw: Raw, decoder: Decoder(a))
}

pub opaque type Expression(a) {
  Expression(raw: Raw, codec: Codec(a))
}

pub opaque type Selection(a) {
  Selection(raw: Raw, decoder: Decoder(a))
}

pub opaque type Query(a) {
  Query(raw: RawQuery, decoder: Decoder(a))
}

pub opaque type Mutation(a) {
  Mutation(raw: RawQuery, decoder: Decoder(a))
}

pub fn text() -> Codec(String) {
  Codec(param.string, decode.string)
}

pub fn integer() -> Codec(Int) {
  Codec(param.int, row.int())
}

pub fn real() -> Codec(Float) {
  Codec(param.float, row.float())
}

pub fn boolean() -> Codec(Bool) {
  Codec(param.bool, decode.bool)
}

pub fn timestamp() -> Codec(Timestamp) {
  Codec(param.timestamp, row.timestamp())
}

pub fn text_array() -> Codec(List(String)) {
  Codec(param.strings, row.strings())
}

pub fn jsonb() -> Codec(Dynamic) {
  Codec(fn(v) { v }, row.jsonb())
}

pub fn optional(codec: Codec(a)) -> Codec(Option(a)) {
  Codec(
    fn(value) {
      case value {
        None -> js.null()
        Some(v) -> codec.encode(v)
      }
    },
    decode.optional(codec.decode),
  )
}

pub fn table(name: String, decoder: Decoder(a)) -> Table(a) {
  Table(raw_table(name), decoder)
}

pub fn alias(table: Table(a), name: String) -> Table(a) {
  Table(alias_ffi(table.raw, name), table.decoder)
}

pub fn column(
  table: Table(a),
  property: String,
  codec: Codec(b),
) -> Expression(b) {
  Expression(column_ffi(table.raw, property), codec)
}

pub fn nullable(expression: Expression(a)) -> Expression(Option(a)) {
  Expression(expression.raw, optional(expression.codec))
}

pub fn all_columns(table: Table(a)) -> Selection(a) {
  Selection(columns_ffi(table.raw), table.decoder)
}

pub fn field(name: String, expression: Expression(a)) -> Selection(a) {
  Selection(
    field_ffi(name, expression.raw),
    decode.field(name, expression.codec.decode, decode.success),
  )
}

pub fn aliased_field(name: String, expression: Expression(a)) -> Selection(a) {
  Selection(
    field_ffi(name, alias_expression_ffi(expression.raw, name)),
    decode.field(name, expression.codec.decode, decode.success),
  )
}

@external(javascript, "./orm_ffi.mjs", "aliasExpression")
fn alias_expression_ffi(expression: Raw, name: String) -> Raw

pub fn pair(a: Selection(a), b: Selection(b)) -> Selection(#(a, b)) {
  let decoder = {
    use a <- decode.then(a.decoder)
    use b <- decode.then(b.decoder)
    decode.success(#(a, b))
  }
  Selection(merge_ffi(a.raw, b.raw), decoder)
}

pub fn map(selection: Selection(a), f: fn(a) -> b) -> Selection(b) {
  Selection(selection.raw, decode.map(selection.decoder, f))
}

pub fn nested(name: String, selection: Selection(a)) -> Selection(a) {
  Selection(
    field_ffi(name, selection.raw),
    decode.field(name, selection.decoder, decode.success),
  )
}

pub fn optional_selection(selection: Selection(a)) -> Selection(Option(a)) {
  Selection(selection.raw, decode.optional(selection.decoder))
}

pub fn select(table: Table(a), selection: Selection(b)) -> Query(b) {
  Query(select_ffi(table.raw, selection.raw), selection.decoder)
}

pub fn subquery(query: Query(a), name: String) -> Table(a) {
  Table(subquery_ffi(query.raw, name), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "subquery")
fn subquery_ffi(query: RawQuery, name: String) -> Raw

pub fn left_join_lateral(
  query: Query(a),
  table: Table(b),
  on: Condition,
) -> Query(a) {
  Query(join_ffi(query.raw, "leftLateral", table.raw, on), query.decoder)
}

pub fn from(table: Table(a)) -> Query(a) {
  select(table, all_columns(table))
}

pub fn where(query: Query(a), condition: Condition) -> Query(a) {
  Query(where_ffi(query.raw, condition), query.decoder)
}

pub fn inner_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, "inner", table.raw, on), query.decoder)
}

pub fn left_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, "left", table.raw, on), query.decoder)
}

pub fn right_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, "right", table.raw, on), query.decoder)
}

pub fn full_join(query: Query(a), table: Table(b), on: Condition) -> Query(a) {
  Query(join_ffi(query.raw, "full", table.raw, on), query.decoder)
}

pub fn limit(query: Query(a), count: Int) -> Query(a) {
  Query(limit_ffi(query.raw, count), query.decoder)
}

pub fn offset(query: Query(a), count: Int) -> Query(a) {
  Query(offset_ffi(query.raw, count), query.decoder)
}

pub fn order_by(query: Query(a), order: List(Order)) -> Query(a) {
  Query(order_ffi(query.raw, order), query.decoder)
}

pub fn group_by(query: Query(a), expressions: List(Raw)) -> Query(a) {
  Query(group_ffi(query.raw, expressions), query.decoder)
}

pub fn having(query: Query(a), condition: Condition) -> Query(a) {
  Query(having_ffi(query.raw, condition), query.decoder)
}

pub fn distinct(query: Query(a)) -> Query(a) {
  Query(distinct_ffi(query.raw), query.decoder)
}

pub fn reference(expression: Expression(a)) -> Raw {
  expression.raw
}

pub fn asc(expression: Expression(a)) -> Order {
  order_expression(expression.raw, False)
}

pub fn desc(expression: Expression(a)) -> Order {
  order_expression(expression.raw, True)
}

pub fn eq(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "eq", column.codec.encode(value))
}

pub fn ne(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "ne", column.codec.encode(value))
}

pub fn gt(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "gt", column.codec.encode(value))
}

pub fn gte(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "gte", column.codec.encode(value))
}

pub fn lt(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "lt", column.codec.encode(value))
}

pub fn lte(column: Expression(a), value: a) -> Condition {
  compare_value(column.raw, "lte", column.codec.encode(value))
}

pub fn eq_columns(a: Expression(a), b: Expression(a)) -> Condition {
  compare_columns(a.raw, "eq", b.raw)
}

pub fn lte_columns(a: Expression(a), b: Expression(a)) -> Condition {
  compare_columns(a.raw, "lte", b.raw)
}

pub fn gte_columns(a: Expression(a), b: Expression(a)) -> Condition {
  compare_columns(a.raw, "gte", b.raw)
}

pub fn current_year() -> Expression(Int) {
  Expression(current_year_ffi(), integer())
}

pub fn integer_bucket(
  column: Expression(Option(Int)),
  width: Int,
) -> Expression(Option(Int)) {
  Expression(integer_bucket_ffi(column.raw, width), optional(integer()))
}

@external(javascript, "./orm_ffi.mjs", "currentYear")
fn current_year_ffi() -> Raw

@external(javascript, "./orm_ffi.mjs", "integerBucket")
fn integer_bucket_ffi(column: Raw, width: Int) -> Raw

pub fn in_array(column: Expression(a), values: List(a)) -> Condition {
  in_array_ffi(column.raw, list.map(values, column.codec.encode), False)
}

pub fn not_in_array(column: Expression(a), values: List(a)) -> Condition {
  in_array_ffi(column.raw, list.map(values, column.codec.encode), True)
}

pub fn is_null(column: Expression(Option(a))) -> Condition {
  null_ffi(column.raw, False)
}

pub fn is_not_null(column: Expression(Option(a))) -> Condition {
  null_ffi(column.raw, True)
}

pub fn like(column: Expression(String), pattern: String) -> Condition {
  compare_value(column.raw, "like", param.string(pattern))
}

pub fn ilike(column: Expression(String), pattern: String) -> Condition {
  compare_value(column.raw, "ilike", param.string(pattern))
}

pub fn and(conditions: List(Condition)) -> Condition {
  combine_ffi(conditions, True)
}

pub fn or(conditions: List(Condition)) -> Condition {
  combine_ffi(conditions, False)
}

pub fn not(condition: Condition) -> Condition {
  not_ffi(condition)
}

pub fn exists(query: Query(a)) -> Condition {
  exists_ffi(query.raw, False)
}

pub fn not_exists(query: Query(a)) -> Condition {
  exists_ffi(query.raw, True)
}

pub fn array_contains(
  column: Expression(Option(List(String))),
  values: List(String),
) -> Condition {
  array_condition_ffi(column.raw, param.strings(values), False)
}

pub fn array_overlaps(
  column: Expression(Option(List(String))),
  values: List(String),
) -> Condition {
  array_condition_ffi(column.raw, param.strings(values), True)
}

pub fn like_optional(
  column: Expression(Option(String)),
  pattern: String,
) -> Condition {
  compare_value(column.raw, "like", param.string(pattern))
}

pub fn ilike_optional(
  column: Expression(Option(String)),
  pattern: String,
) -> Condition {
  compare_value(column.raw, "ilike", param.string(pattern))
}

pub fn integer_as_real(
  column: Expression(Option(Int)),
) -> Expression(Option(Float)) {
  Expression(cast_real_ffi(column.raw), optional(real()))
}

@external(javascript, "./orm_ffi.mjs", "arrayCondition")
fn array_condition_ffi(column: Raw, values: Dynamic, overlap: Bool) -> Condition

@external(javascript, "./orm_ffi.mjs", "castReal")
fn cast_real_ffi(column: Raw) -> Raw

pub fn count() -> Expression(Int) {
  Expression(aggregate_ffi("count_all", None), integer())
}

pub fn count_column(column: Expression(a)) -> Expression(Int) {
  Expression(aggregate_ffi("count", Some(column.raw)), integer())
}

pub fn count_distinct(column: Expression(a)) -> Expression(Int) {
  Expression(aggregate_ffi("count_distinct", Some(column.raw)), integer())
}

pub fn max(column: Expression(a)) -> Expression(Option(a)) {
  Expression(aggregate_ffi("max", Some(column.raw)), optional(column.codec))
}

pub fn min(column: Expression(a)) -> Expression(Option(a)) {
  Expression(aggregate_ffi("min", Some(column.raw)), optional(column.codec))
}

/// PostgreSQL transaction time, shifted by a parameterized number of seconds.
pub fn now_minus_seconds(seconds: Int) -> Expression(Timestamp) {
  Expression(now_minus_seconds_ffi(seconds), timestamp())
}

@external(javascript, "./orm_ffi.mjs", "nowMinusSeconds")
fn now_minus_seconds_ffi(seconds: Int) -> Raw

pub fn all(query: Query(a), db: Db) -> Task(List(a)) {
  use rows <- task.then(task.attempt_result(execute_ffi(db.pool, query.raw)))
  task.from_result(db.decode_rows(rows, query.decoder, "Drizzle query"))
}

pub fn one(query: Query(a), db: Db) -> Task(Option(a)) {
  use rows <- task.map(all(limit(query, 1), db))
  list.first(rows) |> option.from_result
}

pub fn required(query: Query(a), db: Db, message: String) -> Task(a) {
  one(query, db) |> task.require_task(message)
}

pub fn set(column: Expression(a), value: a) -> Assignment {
  assignment_ffi(column.raw, column.codec.encode(value))
}

pub fn set_expression(
  column: Expression(a),
  value: Expression(a),
) -> Assignment {
  assignment_expr_ffi(column.raw, value.raw)
}

pub fn insert(table: Table(a), values: List(Assignment)) -> Mutation(a) {
  Mutation(insert_ffi(table.raw, values), table.decoder)
}

pub fn insert_many(
  table: Table(a),
  rows: List(List(Assignment)),
) -> Mutation(a) {
  Mutation(insert_many_ffi(table.raw, rows), table.decoder)
}

pub fn update(
  table: Table(a),
  values: List(Assignment),
  condition: Condition,
) -> Mutation(a) {
  Mutation(update_ffi(table.raw, values, condition), table.decoder)
}

pub fn delete(table: Table(a), condition: Condition) -> Mutation(a) {
  Mutation(delete_ffi(table.raw, condition), table.decoder)
}

pub fn on_conflict_do_nothing(mutation: Mutation(a)) -> Mutation(a) {
  Mutation(conflict_nothing_ffi(mutation.raw), mutation.decoder)
}

pub opaque type ConflictTarget {
  ConflictTarget(raw: Raw)
}

pub fn conflict_target(column: Expression(a)) -> ConflictTarget {
  ConflictTarget(column.raw)
}

pub fn on_conflict_update(
  mutation: Mutation(a),
  target: List(ConflictTarget),
  values: List(Assignment),
) -> Mutation(a) {
  Mutation(
    conflict_update_ffi(mutation.raw, list.map(target, fn(t) { t.raw }), values),
    mutation.decoder,
  )
}

pub fn returning(mutation: Mutation(a), db: Db) -> Task(List(a)) {
  use rows <- task.then(
    task.attempt_result(execute_ffi(db.pool, returning_ffi(mutation.raw))),
  )
  task.from_result(db.decode_rows(rows, mutation.decoder, "Drizzle returning"))
}

pub fn returning_one(
  mutation: Mutation(a),
  db: Db,
  message: String,
) -> Task(a) {
  returning(mutation, db)
  |> task.map(fn(rows) { list.first(rows) |> option.from_result })
  |> task.require_task(message)
}

pub fn run(mutation: Mutation(a), db: Db) -> Task(Int) {
  task.attempt_result(run_ffi(db.pool, mutation.raw))
}

pub fn transaction(db: Db, work: fn(Db) -> Task(a)) -> Task(a) {
  db.transaction(db, work)
}

pub type Compiled {
  Compiled(sql: String, params: List(Dynamic))
}

@external(javascript, "./orm_ffi.mjs", "compile")
fn compile_ffi(query: RawQuery) -> Compiled

pub fn to_sql(query: Query(a)) -> Compiled {
  compile_ffi(query.raw)
}

@external(javascript, "./orm_ffi.mjs", "table")
fn raw_table(name: String) -> Raw

@external(javascript, "./orm_ffi.mjs", "alias")
fn alias_ffi(table: Raw, name: String) -> Raw

@external(javascript, "./orm_ffi.mjs", "column")
fn column_ffi(table: Raw, property: String) -> Raw

@external(javascript, "./orm_ffi.mjs", "columns")
fn columns_ffi(table: Raw) -> Raw

@external(javascript, "./orm_ffi.mjs", "field")
fn field_ffi(name: String, value: Raw) -> Raw

@external(javascript, "./orm_ffi.mjs", "merge")
fn merge_ffi(a: Raw, b: Raw) -> Raw

@external(javascript, "./orm_ffi.mjs", "select")
fn select_ffi(table: Raw, selection: Raw) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "where")
fn where_ffi(query: RawQuery, condition: Condition) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "join")
fn join_ffi(
  query: RawQuery,
  kind: String,
  table: Raw,
  condition: Condition,
) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "limit")
fn limit_ffi(query: RawQuery, count: Int) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "offset")
fn offset_ffi(query: RawQuery, count: Int) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "order")
fn order_ffi(query: RawQuery, order: List(Order)) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "group")
fn group_ffi(query: RawQuery, expressions: List(Raw)) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "having")
fn having_ffi(query: RawQuery, condition: Condition) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "distinct")
fn distinct_ffi(query: RawQuery) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "orderExpression")
fn order_expression(column: Raw, descending: Bool) -> Order

@external(javascript, "./orm_ffi.mjs", "compareValue")
fn compare_value(column: Raw, op: String, value: Dynamic) -> Condition

@external(javascript, "./orm_ffi.mjs", "compareColumns")
fn compare_columns(a: Raw, op: String, b: Raw) -> Condition

@external(javascript, "./orm_ffi.mjs", "inArray")
fn in_array_ffi(column: Raw, values: List(Dynamic), negated: Bool) -> Condition

@external(javascript, "./orm_ffi.mjs", "isNull")
fn null_ffi(column: Raw, negated: Bool) -> Condition

@external(javascript, "./orm_ffi.mjs", "combine")
fn combine_ffi(conditions: List(Condition), all: Bool) -> Condition

@external(javascript, "./orm_ffi.mjs", "not")
fn not_ffi(condition: Condition) -> Condition

@external(javascript, "./orm_ffi.mjs", "exists")
fn exists_ffi(query: RawQuery, negated: Bool) -> Condition

@external(javascript, "./orm_ffi.mjs", "aggregate")
fn aggregate_ffi(name: String, column: Option(Raw)) -> Raw

@external(javascript, "./orm_ffi.mjs", "execute")
fn execute_ffi(
  pool: pg.Pool,
  query: RawQuery,
) -> promise.Promise(Result(List(Dynamic), js.Exception))

@external(javascript, "./orm_ffi.mjs", "assignment")
fn assignment_ffi(column: Raw, value: Dynamic) -> Assignment

@external(javascript, "./orm_ffi.mjs", "assignmentExpression")
fn assignment_expr_ffi(column: Raw, value: Raw) -> Assignment

@external(javascript, "./orm_ffi.mjs", "insert")
fn insert_ffi(table: Raw, values: List(Assignment)) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "insertMany")
fn insert_many_ffi(table: Raw, rows: List(List(Assignment))) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "update")
fn update_ffi(
  table: Raw,
  values: List(Assignment),
  condition: Condition,
) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "delete")
fn delete_ffi(table: Raw, condition: Condition) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "conflictNothing")
fn conflict_nothing_ffi(query: RawQuery) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "conflictUpdate")
fn conflict_update_ffi(
  query: RawQuery,
  target: List(Raw),
  values: List(Assignment),
) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "returning")
fn returning_ffi(query: RawQuery) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "run")
fn run_ffi(
  pool: pg.Pool,
  query: RawQuery,
) -> promise.Promise(Result(Int, js.Exception))

pub fn coalesce(
  first: Expression(Option(a)),
  fallback: Expression(a),
) -> Expression(a) {
  Expression(coalesce_ffi(first.raw, fallback.raw), fallback.codec)
}

pub fn coalesce_optional(
  first: Expression(Option(a)),
  fallback: Expression(Option(a)),
) -> Expression(Option(a)) {
  Expression(coalesce_ffi(first.raw, fallback.raw), fallback.codec)
}

@external(javascript, "./orm_ffi.mjs", "coalesce")
fn coalesce_ffi(first: Raw, fallback: Raw) -> Raw

pub fn order_nulls_last(expression: Expression(a), descending: Bool) -> Order {
  order_nulls_last_ffi(expression.raw, descending)
}

@external(javascript, "./orm_ffi.mjs", "orderNullsLast")
fn order_nulls_last_ffi(expression: Raw, descending: Bool) -> Order

pub fn equals_case_insensitive(
  expression: Expression(Option(String)),
  value: String,
) -> Condition {
  equals_case_insensitive_ffi(expression.raw, value)
}

@external(javascript, "./orm_ffi.mjs", "equalsCaseInsensitive")
fn equals_case_insensitive_ffi(expression: Raw, value: String) -> Condition

/// Serializes transaction-scoped operations for the same application key.
pub fn advisory_xact_lock(db: Db, key: String) -> Task(Nil) {
  task.attempt_result(advisory_xact_lock_ffi(db.pool, key))
}

@external(javascript, "./orm_ffi.mjs", "advisoryXactLock")
fn advisory_xact_lock_ffi(
  pool: pg.Pool,
  key: String,
) -> promise.Promise(Result(Nil, js.Exception))

pub fn calendar_day(expression: Expression(Timestamp)) -> Expression(String) {
  Expression(calendar_day_ffi(expression.raw), text())
}

@external(javascript, "./orm_ffi.mjs", "calendarDay")
fn calendar_day_ffi(expression: Raw) -> Raw

pub fn calendar_range(
  expression: Expression(Timestamp),
  from: String,
  to: String,
) -> Condition {
  calendar_range_ffi(expression.raw, from, to)
}

@external(javascript, "./orm_ffi.mjs", "calendarRange")
fn calendar_range_ffi(expression: Raw, from: String, to: String) -> Condition

pub fn after_calendar_day(
  expression: Expression(Timestamp),
  day: String,
) -> Condition {
  after_calendar_day_ffi(expression.raw, day)
}

@external(javascript, "./orm_ffi.mjs", "afterCalendarDay")
fn after_calendar_day_ffi(expression: Raw, day: String) -> Condition

pub fn integer_array() -> Codec(List(Int)) {
  Codec(param.ints, decode.list(row.int()))
}

pub fn value(value: a, codec: Codec(a)) -> Expression(a) {
  Expression(value_ffi(codec.encode(value)), codec)
}

@external(javascript, "./orm_ffi.mjs", "value")
fn value_ffi(value: Dynamic) -> Raw

pub fn sum(expression: Expression(Int)) -> Expression(Option(Int)) {
  Expression(aggregate_ffi("sum", Some(expression.raw)), optional(integer()))
}

pub fn hash_text(
  expression: Expression(Option(String)),
) -> Expression(Option(Int)) {
  Expression(hash_text_ffi(expression.raw), optional(integer()))
}

@external(javascript, "./orm_ffi.mjs", "hashText")
fn hash_text_ffi(expression: Raw) -> Raw

/// Set-returning expressions in one projection are zipped by PostgreSQL.
pub fn unnest_integers(
  expression: Expression(Option(List(Int))),
) -> Expression(Option(Int)) {
  Expression(unnest_ffi(expression.raw), optional(integer()))
}

@external(javascript, "./orm_ffi.mjs", "unnest")
fn unnest_ffi(expression: Raw) -> Raw

pub fn union_all(left: Query(a), right: Query(a)) -> Query(a) {
  Query(union_all_ffi(left.raw, right.raw), left.decoder)
}

@external(javascript, "./orm_ffi.mjs", "unionAll")
fn union_all_ffi(left: RawQuery, right: RawQuery) -> RawQuery

pub fn lower(value: Expression(String)) -> Expression(String) {
  Expression(lower_ffi(value.raw), text())
}

@external(javascript, "./orm_ffi.mjs", "lower")
fn lower_ffi(value: Raw) -> Raw

/// RETURNING a typed projection, without reading unrelated or secret columns.
pub fn returning_as(
  mutation: Mutation(a),
  selection: Selection(b),
  db: Db,
) -> Task(List(b)) {
  use rows <- task.then(
    task.attempt_result(execute_ffi(
      db.pool,
      returning_as_ffi(mutation.raw, selection.raw),
    )),
  )
  task.from_result(db.decode_rows(
    rows,
    selection.decoder,
    "Drizzle returning projection",
  ))
}

pub fn returning_one_as(
  mutation: Mutation(a),
  selection: Selection(b),
  db: Db,
  message: String,
) -> Task(b) {
  returning_as(mutation, selection, db)
  |> task.map(fn(rows) { list.first(rows) |> option.from_result })
  |> task.require_task(message)
}

@external(javascript, "./orm_ffi.mjs", "returningAs")
fn returning_as_ffi(mutation: RawQuery, selection: Raw) -> RawQuery

/// Named common table expressions remain typed, including their projections.
pub fn common_table(query: Query(a), name: String) -> Table(a) {
  Table(common_table_ffi(query.raw, name), query.decoder)
}

pub fn with_common_table(query: Query(a), cte: Table(b)) -> Query(a) {
  Query(with_common_table_ffi(query.raw, cte.raw), query.decoder)
}

pub fn select_values(selection: Selection(a)) -> Query(a) {
  Query(select_values_ffi(selection.raw), selection.decoder)
}

pub fn json_rows(query: Query(a)) -> Expression(List(a)) {
  Expression(
    json_rows_ffi(query.raw),
    Codec(js.coerce, decode.list(query.decoder)),
  )
}

pub fn scalar(query: Query(a), codec: Codec(a)) -> Expression(a) {
  Expression(scalar_ffi(query.raw), codec)
}

pub fn multiply(
  left: Expression(Int),
  right: Expression(Int),
) -> Expression(Int) {
  Expression(multiply_ffi(left.raw, right.raw), integer())
}

pub fn unnest_text(
  expression: Expression(Option(List(String))),
) -> Expression(Option(String)) {
  Expression(unnest_ffi(expression.raw), optional(text()))
}

pub type DatePart {
  Hour
  Month
}

pub fn date_part(
  expression: Expression(Timestamp),
  part: DatePart,
) -> Expression(Int) {
  Expression(
    date_part_ffi(expression.raw, case part {
      Hour -> "hour"
      Month -> "month"
    }),
    integer(),
  )
}

@external(javascript, "./orm_ffi.mjs", "commonTable")
fn common_table_ffi(query: RawQuery, name: String) -> Raw

@external(javascript, "./orm_ffi.mjs", "withCommonTable")
fn with_common_table_ffi(query: RawQuery, cte: Raw) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "selectValues")
fn select_values_ffi(selection: Raw) -> RawQuery

@external(javascript, "./orm_ffi.mjs", "jsonRows")
fn json_rows_ffi(query: RawQuery) -> Raw

@external(javascript, "./orm_ffi.mjs", "scalar")
fn scalar_ffi(query: RawQuery) -> Raw

@external(javascript, "./orm_ffi.mjs", "multiply")
fn multiply_ffi(left: Raw, right: Raw) -> Raw

@external(javascript, "./orm_ffi.mjs", "datePart")
fn date_part_ffi(expression: Raw, part: String) -> Raw

/// Drop a column whose decoder accepts an absent field, for example large lyrics.
pub fn omit_column(
  selection: Selection(a),
  column: Expression(b),
) -> Selection(a) {
  Selection(omit_column_ffi(selection.raw, column.raw), selection.decoder)
}

@external(javascript, "./orm_ffi.mjs", "omitColumn")
fn omit_column_ffi(selection: Raw, column: Raw) -> Raw

pub fn distinct_on(query: Query(a), columns: List(Raw)) -> Query(a) {
  Query(distinct_on_ffi(query.raw, columns), query.decoder)
}

@external(javascript, "./orm_ffi.mjs", "distinctOn")
fn distinct_on_ffi(query: RawQuery, columns: List(Raw)) -> RawQuery

pub fn gt_columns(a: Expression(a), b: Expression(a)) -> Condition {
  compare_columns(a.raw, "gt", b.raw)
}

/// Sum an exponentially decaying weight per timestamp, measured in days.
pub fn decayed_count(
  at: Expression(Timestamp),
  decay: Float,
) -> Expression(Float) {
  Expression(decayed_count_ffi(at.raw, decay), real())
}

@external(javascript, "./orm_ffi.mjs", "decayedCount")
fn decayed_count_ffi(at: Raw, decay: Float) -> Raw

pub fn random_order() -> Order {
  random_order_ffi()
}

@external(javascript, "./orm_ffi.mjs", "randomOrder")
fn random_order_ffi() -> Order

/// Compare a tuple against a scalar-row subquery without truncating timestamps.
pub fn tuple_gt_subquery(expressions: List(Raw), query: Query(a)) -> Condition {
  tuple_gt_subquery_ffi(expressions, query.raw)
}

@external(javascript, "./orm_ffi.mjs", "tupleGtSubquery")
fn tuple_gt_subquery_ffi(expressions: List(Raw), query: RawQuery) -> Condition

pub fn utc_calendar_day(
  expression: Expression(Option(Timestamp)),
) -> Expression(Option(String)) {
  Expression(utc_calendar_day_ffi(expression.raw), optional(text()))
}

@external(javascript, "./orm_ffi.mjs", "utcCalendarDay")
fn utc_calendar_day_ffi(expression: Raw) -> Raw

/// Aggregate matching rows without a second query or connection.
pub fn count_matching(condition: Condition) -> Expression(Int) {
  Expression(count_matching_ffi(condition), integer())
}

@external(javascript, "./orm_ffi.mjs", "countMatching")
fn count_matching_ffi(condition: Condition) -> Raw
