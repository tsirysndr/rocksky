import gleam/dynamic/decode
import rocksky_api/drizzle/orm.{
  alias, aliased_field, all_columns, and, asc, column, count, desc, eq,
  eq_columns, field, group_by, inner_join, integer, left_join, left_join_lateral,
  limit, ne, nested, optional_selection, order_by, pair, reference, select,
  subquery, table, text, where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/users as u

pub fn pairs() {
  table("user_artists_mv", {
    use user <- decode.field("user_id", decode.string)
    use artist <- decode.field("artist_id", decode.string)
    use count <- decode.field("play_count", decode.int)
    decode.success(#(user, artist, count))
  })
}

pub fn target(user_id: String) {
  let pairs = pairs()
  select(pairs, field("artistId", column(pairs, "artistId", text())))
  |> where(eq(column(pairs, "userId", text()), user_id))
  |> subquery("target")
}

pub fn query(user_id: String) {
  let target = target(user_id)
  let pairs = pairs()
  let counts =
    select(
      pairs,
      pair(
        field("userId", column(pairs, "userId", text())),
        aliased_field("sharedCount", count()),
      ),
    )
    |> inner_join(
      target,
      eq_columns(
        column(target, "artistId", text()),
        column(pairs, "artistId", text()),
      ),
    )
    |> where(ne(column(pairs, "userId", text()), user_id))
    |> group_by([reference(column(pairs, "userId", text()))])
    |> order_by([desc(count()), asc(column(pairs, "userId", text()))])
    |> limit(50)
    |> subquery("neighbours")
  let shared = alias(pairs, "shared")
  let top =
    select(
      shared,
      pair(
        field("artistId", column(shared, "artistId", text())),
        field("playCount", column(shared, "playCount", integer())),
      ),
    )
    |> inner_join(
      target,
      eq_columns(
        column(target, "artistId", text()),
        column(shared, "artistId", text()),
      ),
    )
    |> where(eq_columns(
      column(shared, "userId", text()),
      column(counts, "userId", text()),
    ))
    |> order_by([
      desc(column(shared, "playCount", integer())),
      asc(column(shared, "artistId", text())),
    ])
    |> limit(5)
    |> subquery("top_shared")
  let users = u.table()
  let artists = a.table()
  select(
    counts,
    pair(
      nested("user", all_columns(users)),
      pair(
        field("shared", column(counts, "sharedCount", integer())),
        nested("artist", optional_selection(all_columns(artists))),
      ),
    ),
  )
  |> inner_join(
    users,
    eq_columns(u.id(users), column(counts, "userId", text())),
  )
  |> left_join_lateral(top, and([]))
  |> left_join(
    artists,
    eq_columns(a.id(artists), column(top, "artistId", text())),
  )
  |> order_by([
    desc(column(counts, "sharedCount", integer())),
    asc(column(counts, "userId", text())),
    desc(column(top, "playCount", integer())),
    asc(column(top, "artistId", text())),
  ])
}
