import gleam/option.{Some}
import gleam/string
import gleeunit/should
import rocksky_api/db/param
import rocksky_api/drizzle/orm.{
  alias, all_columns, count, desc, eq, eq_columns, field, from, group_by, gt,
  having, left_join, limit, nested, optional_selection, order_by, pair,
  reference, select, to_sql, where,
}
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/tracks

pub fn parameterized_typed_select_test() {
  let t = tracks.table()
  let sql =
    from(t) |> where(eq(tracks.title(t), "' OR true --")) |> limit(20) |> to_sql
  string.contains(sql.sql, "' OR true") |> should.be_false
  string.contains(sql.sql, "\"tracks\".\"title\" = $1") |> should.be_true
  sql.params |> should.equal([param.string("' OR true --"), param.int(20)])
}

pub fn immutable_query_branching_test() {
  let t = tracks.table()
  let base = from(t)
  let a = base |> where(eq(tracks.title(t), "A")) |> to_sql
  let b = base |> where(eq(tracks.title(t), "B")) |> to_sql
  a.params |> should.equal([param.string("A")])
  b.params |> should.equal([param.string("B")])
  to_sql(base).params |> should.equal([])
}

pub fn nullable_join_and_alias_test() {
  let t = tracks.table() |> alias("t")
  let a = artists.table() |> alias("a")
  let projection =
    pair(
      nested("track", all_columns(t)),
      nested("artist", optional_selection(all_columns(a))),
    )
  let sql =
    select(t, projection)
    |> left_join(a, eq_columns(tracks.artist_uri(t), artists.uri(a)))
    |> where(eq(tracks.uri(t), Some("at://track")))
    |> to_sql
  string.contains(sql.sql, "left join \"artists\" \"a\"") |> should.be_true
  sql.params |> should.equal([param.string("at://track")])
}

pub fn aggregate_and_group_test() {
  let t = tracks.table()
  let sql =
    select(t, pair(field("artist", tracks.artist(t)), field("count", count())))
    |> group_by([reference(tracks.artist(t))])
    |> having(gt(count(), 2))
    |> order_by([desc(count())])
    |> to_sql
  string.contains(sql.sql, "group by \"tracks\".\"artist\"") |> should.be_true
  sql.params |> should.equal([param.int(2)])
}
