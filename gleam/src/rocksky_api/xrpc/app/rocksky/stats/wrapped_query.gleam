import gleam/option.{type Option, Some}
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/drizzle/orm.{
  type Query, Hour, Month, aliased_field, and, asc, calendar_day, coalesce,
  column, common_table, count, date_part, desc, distinct, eq, eq_columns, field,
  from, group_by, gte, inner_join, integer, is_not_null, json_rows, limit, lt,
  map, multiply, ne, not_exists, nullable, optional, order_by, pair, reference,
  scalar, select, select_values, subquery, sum, text, text_array, timestamp,
  unnest_text, value, where, with_common_table,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/tracks as t

pub type Summary {
  Summary(
    total_scrobbles: Int,
    total_time: Int,
    top_tracks: List(#(Option(String), Int)),
    top_artists: List(#(String, Int)),
    top_albums: List(#(Option(String), Int)),
    top_genres: List(#(Option(String), Int)),
    daily: List(#(String, Int)),
    hours: List(#(Int, Int)),
    months: List(#(Int, Int)),
    new_artists: Int,
  )
}

pub fn query(
  user_id: String,
  start: Timestamp,
  end: Timestamp,
) -> Query(Summary) {
  let scrobbles = s.table()
  let year =
    select(
      scrobbles,
      pair(
        pair(
          field("at", s.timestamp(scrobbles)),
          field("trackId", s.track_id(scrobbles)),
        ),
        pair(
          field("artistId", s.artist_id(scrobbles)),
          field("albumId", s.album_id(scrobbles)),
        ),
      ),
    )
    |> where(
      and([
        eq(s.user_id(scrobbles), Some(user_id)),
        gte(s.timestamp(scrobbles), start),
        lt(s.timestamp(scrobbles), end),
      ]),
    )
    |> common_table("year_scrobbles")
  let track_id = column(year, "trackId", optional(text()))
  let artist_id = column(year, "artistId", optional(text()))
  let album_id = column(year, "albumId", optional(text()))
  let at = column(year, "at", timestamp())
  let tracks =
    select(
      year,
      pair(field("trackId", track_id), aliased_field("plays", count())),
    )
    |> group_by([reference(track_id)])
    |> common_table("track_counts")
  let artists =
    select(
      year,
      pair(field("artistId", artist_id), aliased_field("plays", count())),
    )
    |> group_by([reference(artist_id)])
    |> common_table("artist_counts")
  let artist_table = a.table()
  let ranked =
    select(
      artists,
      pair(
        pair(
          field("artistId", a.id(artist_table)),
          field("genres", a.genres(artist_table)),
        ),
        aliased_field("plays", column(artists, "plays", integer())),
      ),
    )
    |> inner_join(
      artist_table,
      eq_columns(
        nullable(a.id(artist_table)),
        column(artists, "artistId", optional(text())),
      ),
    )
    |> where(ne(a.name(artist_table), "Various Artists"))
    |> common_table("ranked_artists")
  let daily =
    select(
      year,
      pair(
        aliased_field("date", calendar_day(at)),
        aliased_field("plays", count()),
      ),
    )
    |> group_by([reference(calendar_day(at))])
    |> common_table("daily")
  let prior =
    select(scrobbles, field("artistId", s.artist_id(scrobbles)))
    |> where(
      and([
        eq(s.user_id(scrobbles), Some(user_id)),
        lt(s.timestamp(scrobbles), start),
        is_not_null(s.artist_id(scrobbles)),
      ]),
    )
    |> distinct
    |> common_table("prior_artists")
  let track_table = t.table()
  let total_time =
    select(
      tracks,
      field(
        "time",
        coalesce(
          sum(multiply(
            column(tracks, "plays", integer()),
            t.duration(track_table),
          )),
          value(0, integer()),
        ),
      ),
    )
    |> inner_join(
      track_table,
      eq_columns(
        nullable(t.id(track_table)),
        column(tracks, "trackId", optional(text())),
      ),
    )
  let top_tracks =
    from(tracks)
    |> order_by([
      desc(column(tracks, "plays", integer())),
      asc(column(tracks, "trackId", optional(text()))),
    ])
    |> limit(5)
  let top_artists =
    select(
      ranked,
      pair(
        field("artistId", column(ranked, "artistId", text())),
        aliased_field("plays", column(ranked, "plays", integer())),
      ),
    )
    |> order_by([
      desc(column(ranked, "plays", integer())),
      asc(column(ranked, "artistId", text())),
    ])
    |> limit(5)
  let top_albums =
    select(year, pair(field("albumId", album_id), field("plays", count())))
    |> where(is_not_null(album_id))
    |> group_by([reference(album_id)])
    |> order_by([desc(count()), asc(album_id)])
    |> limit(6)
  let genres =
    select(
      ranked,
      pair(
        aliased_field(
          "genre",
          unnest_text(column(ranked, "genres", optional(text_array()))),
        ),
        aliased_field("plays", column(ranked, "plays", integer())),
      ),
    )
    |> subquery("genres")
  let genre = column(genres, "genre", optional(text()))
  let genre_count =
    coalesce(sum(column(genres, "plays", integer())), value(0, integer()))
  let top_genres =
    select(genres, pair(field("genre", genre), field("plays", genre_count)))
    |> where(and([is_not_null(genre), ne(genre, Some(""))]))
    |> group_by([reference(genre)])
    |> order_by([desc(genre_count), asc(genre)])
    |> limit(5)
  let hours =
    select(
      year,
      pair(field("hour", date_part(at, Hour)), field("plays", count())),
    )
    |> group_by([reference(date_part(at, Hour))])
    |> order_by([desc(count()), asc(date_part(at, Hour))])
    |> limit(1)
  let months =
    select(
      year,
      pair(field("month", date_part(at, Month)), field("plays", count())),
    )
    |> group_by([reference(date_part(at, Month))])
    |> order_by([asc(date_part(at, Month))])
  let new_artists =
    select(artists, field("count", count()))
    |> where(
      and([
        is_not_null(column(artists, "artistId", optional(text()))),
        not_exists(
          from(prior)
          |> where(eq_columns(
            column(prior, "artistId", optional(text())),
            column(artists, "artistId", optional(text())),
          )),
        ),
      ]),
    )
  select_values(
    pair(
      pair(
        field("total", scalar(select(year, field("count", count())), integer())),
        field("time", scalar(total_time, integer())),
      ),
      pair(
        pair(
          field("tracks", json_rows(top_tracks)),
          field("artists", json_rows(top_artists)),
        ),
        pair(
          pair(
            field("albums", json_rows(top_albums)),
            field("genres", json_rows(top_genres)),
          ),
          pair(
            pair(
              field(
                "daily",
                json_rows(
                  from(daily) |> order_by([asc(column(daily, "date", text()))]),
                ),
              ),
              field("hours", json_rows(hours)),
            ),
            pair(
              field("months", json_rows(months)),
              field("newArtists", scalar(new_artists, integer())),
            ),
          ),
        ),
      ),
    )
    |> map(fn(v) {
      Summary(
        v.0.0,
        v.0.1,
        v.1.0.0,
        v.1.0.1,
        v.1.1.0.0,
        v.1.1.0.1,
        v.1.1.1.0.0,
        v.1.1.1.0.1,
        v.1.1.1.1.0,
        v.1.1.1.1.1,
      )
    }),
  )
  |> with_common_table(year)
  |> with_common_table(tracks)
  |> with_common_table(artists)
  |> with_common_table(ranked)
  |> with_common_table(daily)
  |> with_common_table(prior)
}
