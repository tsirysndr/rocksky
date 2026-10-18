import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/discogs_models as models
import rocksky_api/log
import rocksky_api/node/axios
import rocksky_api/task

fn response(work, decoder) {
  work
  |> task.attempt_result
  |> task.try_map(fn(r: axios.Response) {
    decode.run(r.data, decoder)
    |> result.map(Some)
    |> result.map_error(error.Decode("Discogs response", _))
  })
  |> task.rescue(fn(e) {
    log.warn("Discogs request failed: " <> error.describe(e))
    task.ok(None)
  })
}

pub fn enrich_with_discogs(ctx: Context, query: models.DiscogsQuery) {
  let body =
    json.object([
      #("title", json.string(option.unwrap(query.title, ""))),
      #("artist", json.string(query.artist)),
      ..case query.album {
        None -> []
        Some(a) -> [#("album", json.string(a))]
      }
    ])
  response(
    axios.post(ctx.discogs, "/enrich", body, axios.default_options()),
    models.discogs_enrich_response_decoder(),
  )
}

pub fn get_discogs_release(ctx: Context, id: Int) {
  response(
    axios.get(
      ctx.discogs,
      "/releases/" <> int.to_string(id),
      axios.default_options(),
    ),
    models.discogs_release_decoder(),
  )
}

pub fn get_discogs_master(ctx: Context, id: Int) {
  response(
    axios.get(
      ctx.discogs,
      "/masters/" <> int.to_string(id),
      axios.default_options(),
    ),
    models.discogs_master_decoder(),
  )
}
