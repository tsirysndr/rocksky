import gleam/int
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, count, count_column, count_distinct, desc, eq, eq_columns,
  field, from, group_by, in_array, inner_join, limit as db_limit, not_exists,
  nullable, offset as db_offset, one, order_by, pair, reference, required,
  select, subquery, where,
}
import rocksky_api/drizzle/schema/artist_tracks as at
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lexicon/models
import rocksky_api/lib/helpers
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/song
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(600_000, 200)
  let empty =
    models.GetArtistTracksOutput(tracks: Some([]))
    |> models.encode_get_artist_tracks_output
  xrpc_server.method(
    server,
    "app.rocksky.artist.getArtistTracks",
    None,
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getArtistTracks")
          |> handler.on_error(handler.Fallback(empty)),
        models.get_artist_tracks_params_decoder(),
      )
      use tracks <- task.map(
        query_cache.get(
          cache,
          models.encode_get_artist_tracks_params(params) |> json.to_string,
          fn() { retrieve(ctx, params) },
        ),
      )
      models.GetArtistTracksOutput(tracks: Some(tracks))
      |> models.encode_get_artist_tracks_output
    },
  )
}

fn retrieve(ctx: Context, params: models.GetArtistTracksParams) {
  let artists = a.table()
  let scrobbles = sc.table()
  let tracks = t.table()
  let links = at.table()
  use artist <- task.then(
    select(
      artists,
      pair(field("id", a.id(artists)), field("name", a.name(artists))),
    )
    |> where(eq(a.uri(artists), params.uri))
    |> one(ctx.read_db),
  )
  case artist {
    None -> task.ok([])
    Some(#(id, name)) -> {
      let limit = option.unwrap(params.limit, 100)
      let offset = option.unwrap(params.offset, 0)
      let played =
        select(scrobbles, field("id", sc.track_id(scrobbles)))
        |> where(eq(sc.artist_id(scrobbles), Some(id)))
        |> group_by([reference(sc.track_id(scrobbles))])
      use ranked <- task.then(
        select(
          scrobbles,
          pair(
            field("id", sc.track_id(scrobbles)),
            pair(
              field("plays", count_column(sc.id(scrobbles))),
              field("listeners", count_distinct(sc.user_id(scrobbles))),
            ),
          ),
        )
        |> where(eq(sc.artist_id(scrobbles), Some(id)))
        |> group_by([reference(sc.track_id(scrobbles))])
        |> order_by([
          desc(count_column(sc.id(scrobbles))),
          asc(sc.track_id(scrobbles)),
        ])
        |> db_limit(limit)
        |> db_offset(offset)
        |> all(ctx.read_db)
        |> task.map(fn(rows) {
          list.filter_map(rows, fn(r) {
            option.to_result(
              option.map(r.0, fn(id) { #(id, r.1.0, r.1.1) }),
              Nil,
            )
          })
        }),
      )
      use unplayed <- task.then(case list.length(ranked) < limit {
        False -> task.ok([])
        True -> {
          use played_count <- task.then(case offset {
            0 -> task.ok(0)
            _ ->
              select(subquery(played, "played"), field("count", count()))
              |> required(ctx.read_db, "Missing played count")
          })
          let existing =
            select(scrobbles, field("id", sc.id(scrobbles)))
            |> where(
              and([
                eq(sc.artist_id(scrobbles), Some(id)),
                eq_columns(sc.track_id(scrobbles), nullable(at.track_id(links))),
              ]),
            )
          use candidates <- task.map(
            select(
              links,
              pair(
                field("id", t.id(tracks)),
                pair(
                  field("artist", t.artist(tracks)),
                  field("album_artist", t.album_artist(tracks)),
                ),
              ),
            )
            |> inner_join(tracks, eq_columns(t.id(tracks), at.track_id(links)))
            |> where(and([eq(at.artist_id(links), id), not_exists(existing)]))
            |> order_by([asc(at.track_id(links))])
            |> all(ctx.read_db),
          )
          candidates
          |> list.filter(fn(r) {
            helpers.credits_artist(Some(name), Some(r.1.0), Some(r.1.1))
          })
          |> list.drop(int.max(0, offset - played_count))
          |> list.take(limit - list.length(ranked))
          |> list.map(fn(r) { #(r.0, 0, 0) })
        }
      })
      let ranked = list.append(ranked, unplayed)
      case ranked {
        [] -> task.ok([])
        _ -> {
          use tracks <- task.map(
            from(tracks)
            |> where(in_array(t.id(tracks), list.map(ranked, fn(r) { r.0 })))
            |> all(ctx.read_db),
          )
          list.filter_map(ranked, fn(r) {
            case list.find(tracks, fn(t) { t.id == r.0 }) {
              Error(_) -> Error(Nil)
              Ok(track) -> Ok(song.catalog(track, r.1, r.2))
            }
          })
        }
      }
    }
  }
}
