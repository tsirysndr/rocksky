import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_feeds/drizzle
import rocksky_feeds/types.{type Algorithm, type Query, type Row, All, Genre}

pub fn query(algorithm: Algorithm, limit: Int, cursor: Option(Int)) -> Query {
  let filter = case cursor {
    None -> drizzle.raw("")
    Some(ms) ->
      drizzle.join([
        drizzle.raw(" and recent.timestamp < to_timestamp("),
        drizzle.integer(ms),
        drizzle.raw("::double precision / 1000)"),
      ])
  }
  case algorithm {
    All ->
      drizzle.join([
        drizzle.raw(
          "select recent.uri, (extract(epoch from recent.timestamp) * 1000)::double precision as \"timestampMs\" from ",
        ),
        drizzle.table("scrobbles"),
        drizzle.raw(" recent where true"),
        filter,
        drizzle.raw(" order by recent.timestamp desc limit "),
        drizzle.integer(limit),
      ])
    Genre(_, genre) ->
      drizzle.join([
        drizzle.raw(
          "select newest.uri, (extract(epoch from newest.timestamp) * 1000)::double precision as \"timestampMs\" from ",
        ),
        drizzle.table("artists"),
        drizzle.raw(
          " artist cross join lateral (select recent.uri, recent.timestamp from ",
        ),
        drizzle.table("scrobbles"),
        drizzle.raw(
          " recent where recent.artist_id = artist.xata_id and recent.uri is not null",
        ),
        filter,
        drizzle.raw(" order by recent.timestamp desc limit "),
        drizzle.integer(limit),
        drizzle.raw(") newest where artist.genres @> array["),
        drizzle.text(genre),
        drizzle.raw("]::text[] order by newest.timestamp desc limit "),
        drizzle.integer(limit),
      ])
  }
  |> drizzle.compile
}

pub fn encode(rows: List(Row)) -> String {
  let cursor = case list.last(rows) {
    Ok(row) -> [#("cursor", json.string(int.to_string(row.timestamp_ms)))]
    Error(_) -> []
  }
  json.object([
    #(
      "feed",
      json.array(rows, fn(row) {
        json.object([
          #("scrobble", case row.uri {
            None -> json.null()
            Some(uri) -> json.string(uri)
          }),
        ])
      }),
    ),
    ..cursor
  ])
  |> json.to_string
}
