import gleam/dict
import gleam/option.{None, Some}
import gleam/string
import gleeunit/should
import rocksky_api/db/param
import rocksky_api/drizzle/orm.{from, to_sql, where}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/artists
import rocksky_api/drizzle/schema/tracks
import rocksky_api/xrpc/app/rocksky/song/get_songs

fn fields() {
  get_songs.fields()
  |> dict.insert("genres", rsql.TextArray(artists.genres(artists.table())))
}

fn query(filter) {
  let assert Ok(Some(condition)) = rsql.compile(Some(filter), fields())
  from(tracks.table()) |> where(condition) |> to_sql
}

pub fn comparison_and_parameters_test() {
  let q = query("(genre==house,genre==electro);duration=gt=200000")
  string.contains(q.sql, " or ") |> should.be_true
  string.contains(q.sql, " and ") |> should.be_true
  q.params
  |> should.equal([
    param.string("house"),
    param.string("electro"),
    param.float(200_000.0),
  ])
  let q = query("artist!=Eminem")
  string.contains(q.sql, " <> $1") |> should.be_true
}

pub fn wildcard_escaping_test() {
  let q = query("artist==\"*100%_*\"")
  string.contains(q.sql, " ilike $1") |> should.be_true
  q.params |> should.equal([param.string("%100\\%\\_%")])
  let q = query("artist!=Daft*")
  string.contains(q.sql, "not ") |> should.be_true
}

pub fn arrays_and_membership_test() {
  let q = query("genre=in=(house,electro)")
  string.contains(q.sql, " in ($1, $2)") |> should.be_true
  q.params |> should.equal([param.string("house"), param.string("electro")])
  let q = query("genres=out=(house,electro)")
  string.contains(q.sql, "not ") |> should.be_true
  string.contains(q.sql, " && ") |> should.be_true
  let q = query("genres==house")
  string.contains(q.sql, " @> ") |> should.be_true
  let q = query("genres!=house")
  string.contains(q.sql, "not ") |> should.be_true
}

pub fn null_and_dates_test() {
  let q = query("uri==null")
  string.contains(q.sql, " is null") |> should.be_true
  q.params |> should.equal([])
  string.contains(query("uri!=null").sql, " is not null") |> should.be_true
  rsql.compile(Some("createdAt=ge=2025-01-01"), fields()) |> should.be_ok
  rsql.compile(Some("createdAt=lt=not-a-date"), fields()) |> should.be_error
  rsql.compile(Some("duration=gt=abc"), fields()) |> should.be_error
  rsql.compile(Some("genres=gt=house"), fields()) |> should.be_error
}

pub fn invalid_and_empty_filters_test() {
  let assert Error(message) = rsql.compile(Some("password==secret"), fields())
  string.contains(message, "Unknown filter field \"password\"")
  |> should.be_true
  rsql.compile(Some("title=="), fields()) |> should.be_error
  rsql.compile(Some("title"), fields()) |> should.be_error
  rsql.compile(None, fields()) |> should.equal(Ok(None))
  rsql.compile(Some("  "), fields()) |> should.equal(Ok(None))
}
