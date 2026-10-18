import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{all, from, in_array, where}
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/charts/ranking
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let cache = query_cache.new(120_000, 200)
  let fallback =
    models.GetTopTracksOutput(Some([])) |> models.encode_get_top_tracks_output
  xrpc_server.method(server, "app.rocksky.charts.getTopTracks", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getTopTracks")
        |> handler.timeout(120_000)
        |> handler.on_error(handler.Fallback(fallback)),
      models.get_top_tracks_params_decoder(),
    )
    use tracks <- task.map(
      query_cache.get(
        cache,
        models.encode_get_top_tracks_params(params) |> json.to_string,
        fn() { retrieve(ctx, params) },
      ),
    )
    models.GetTopTracksOutput(Some(tracks))
    |> models.encode_get_top_tracks_output
  })
}

fn retrieve(ctx: Context, params: models.GetTopTracksParams) {
  let table = t.table()
  let limit = case params.limit {
    None | Some(0) -> 50
    Some(n) -> n
  }
  use counts <- task.then(ranking.retrieve(
    ctx,
    False,
    params.did,
    params.start_date,
    params.end_date,
    limit,
    option.unwrap(params.offset, 0),
  ))
  let ids = list.filter_map(counts, fn(r) { option.to_result(r.0, Nil) })
  use tracks <- task.map(
    from(table) |> where(in_array(t.id(table), ids)) |> all(ctx.read_db),
  )
  list.filter_map(counts, fn(count) {
    case list.find(tracks, fn(t) { Some(t.id) == count.0 }) {
      Error(_) -> Error(Nil)
      Ok(t) ->
        Ok(
          models.SongViewBasic(
            ..models.new_song_view_basic(),
            id: Some(t.id),
            title: Some(t.title),
            artist: Some(t.artist),
            album_artist: Some(t.album_artist),
            album_art: t.album_art,
            uri: t.uri,
            album: Some(t.album),
            duration: Some(t.duration),
            track_number: t.track_number,
            disc_number: t.disc_number,
            play_count: Some(count.1.0),
            unique_listeners: Some(count.1.1),
            album_uri: t.album_uri,
            artist_uri: t.artist_uri,
            sha256: Some(t.sha256),
            created_at: Some(row.iso8601(t.created_at)),
            tags: Some(case t.genre {
              None | Some("") -> []
              Some(genre) -> [genre]
            }),
          ),
        )
    }
  })
}
