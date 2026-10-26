import gleam/dict
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, desc, eq, eq_columns, field, from, in_array, left_join,
  nested, nullable, omit_column, one, order_by, pair, select, where,
}
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/feeds as fe
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lexicon/json_value
import rocksky_api/lexicon/models
import rocksky_api/lib/feed_cache
import rocksky_api/lib/query_cache
import rocksky_api/lib/scrobble_likes
import rocksky_api/node/axios
import rocksky_api/node/redis
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

fn skeleton_decoder() {
  use cursor <- decode.optional_field(
    "cursor",
    None,
    decode.optional(decode.string),
  )
  use feed <- decode.field(
    "feed",
    decode.list(decode.field("scrobble", decode.string, decode.success)),
  )
  decode.success(#(cursor, feed))
}

pub fn retrieve(
  ctx: Context,
  params: models.GetFeedParams,
  did: Option(String),
) {
  let feeds = fe.table()
  use feed <- task.then(
    from(feeds)
    |> where(eq(fe.uri(feeds), params.feed))
    |> one(ctx.db)
    |> task.require_task("Feed not found"),
  )
  let own =
    string.contains(ctx.env.public_url, "localhost")
    || feed.did == ctx.env.rocksky_feedgen_did
  let url = case own {
    True -> "http://localhost:" <> int.to_string(ctx.env.rocksky_feedgen_port)
    False ->
      "https://"
      <> {
        string.split(feed.did, "did:web:")
        |> list.drop(1)
        |> list.first
        |> result.unwrap("undefined")
      }
  }
  let query = [
    #("feed", feed.uri),
    ..list.flatten([
      case params.limit {
        Some(n) -> [#("limit", int.to_string(n))]
        None -> []
      },
      case params.cursor {
        Some(c) -> [#("cursor", c)]
        None -> []
      },
    ])
  ]
  use response <- task.then(
    axios.get(
      axios.global(),
      url <> "/xrpc/app.rocksky.feed.getFeedSkeleton",
      axios.with_params(query),
    )
    |> task.attempt_result,
  )
  use skeleton <- task.then(
    decode.run(response.data, skeleton_decoder())
    |> error.decode("Feed skeleton", _)
    |> task.from_result,
  )
  use items <- task.map(hydrate(ctx, skeleton.1, did))
  models.FeedView(
    Some(list.map(items, fn(item) { models.FeedItemView(Some(item)) })),
    skeleton.0,
    None,
  )
}

pub fn hydrate(ctx: Context, uris: List(String), did: Option(String)) {
  let s = sc.table()
  let t = tr.table()
  let u = us.table()
  let a = ar.table()
  case uris {
    [] -> task.ok([])
    _ -> {
      use rows <- task.then(
        select(
          s,
          pair(
            nested("scrobble", all_columns(s)),
            pair(
              nested("track", all_columns(t) |> omit_column(tr.lyrics(t))),
              pair(
                nested(
                  "user",
                  pair(
                    field("handle", us.handle(u)),
                    pair(
                      field("name", us.display_name(u)),
                      field("avatar", us.avatar(u)),
                    ),
                  ),
                ),
                field("genres", ar.genres(a)),
              ),
            ),
          ),
        )
        |> left_join(t, eq_columns(sc.track_id(s), nullable(tr.id(t))))
        |> left_join(u, eq_columns(sc.user_id(s), nullable(us.id(u))))
        |> left_join(a, eq_columns(tr.artist_uri(t), ar.uri(a)))
        |> where(in_array(sc.uri(s), list.map(uris, Some)))
        |> order_by([desc(sc.timestamp(s))])
        |> all(ctx.db),
      )
      let ids = list.map(rows, fn(r) { r.1.0.id }) |> list.unique
      use likes <- task.map(scrobble_likes.retrieve(ctx, ids, did))
      let counts = dict.from_list(likes.0)
      list.map(rows, fn(r) {
        let #(scrobble, #(track, #(user, genres))) = r
        models.ScrobbleViewBasic(
          ..models.new_scrobble_view_basic(),
          id: Some(scrobble.id),
          title: Some(track.title),
          artist: Some(track.artist),
          album: Some(track.album),
          album_artist: Some(track.album_artist),
          artist_uri: track.artist_uri,
          album_uri: track.album_uri,
          track_uri: track.uri,
          uri: scrobble.uri,
          cover: track.album_art,
          date: Some(row.iso8601(scrobble.timestamp)),
          created_at: Some(row.iso8601(scrobble.created_at)),
          updated_at: Some(json_value.String(row.iso8601(scrobble.updated_at))),
          user: Some(user.0),
          user_display_name: user.1.0,
          user_avatar: Some(user.1.1),
          tags: genres,
          liked: Some(list.contains(likes.1, track.id)),
          likes_count: Some(dict.get(counts, track.id) |> result.unwrap(0)),
          sha256: Some(track.sha256),
          mb_id: track.mb_id,
          isrc: track.isrc,
          spotify_link: track.spotify_link,
          composer: track.composer,
          track_number: track.track_number,
          duration: Some(track.duration),
          youtube_link: track.youtube_link,
          apple_music_link: track.apple_music_link,
          tidal_link: track.tidal_link,
          disc_number: track.disc_number,
          genre: track.genre,
          label: track.label,
          copyright_message: track.copyright_message,
          key: track.key,
          bpm: track.bpm,
          xata_version: track.xata_version,
        )
      })
    }
  }
}

pub fn cached(ctx: Context, params: models.GetFeedParams, did: Option(String)) {
  use version <- task.then(feed_cache.feed_version(ctx, params.feed))
  let key =
    "feed:getFeed:v2:"
    <> option.unwrap(did, "anon")
    <> ":"
    <> params.feed
    <> ":"
    <> int.to_string(version)
    <> ":"
    <> option.unwrap(option.map(params.limit, int.to_string), "")
    <> ":"
    <> option.unwrap(params.cursor, "")
  use cached <- task.then(redis.get(ctx.redis, key) |> task.attempt_result)
  case cached {
    Some(cached) ->
      json.parse(cached, models.feed_view_decoder())
      |> result.map_error(fn(_) { error.Message("Invalid feed cache") })
      |> task.from_result
    None -> {
      use view <- task.then(retrieve(ctx, params, did))
      use _ <- task.map(
        redis.set_ex(
          ctx.redis,
          key,
          30,
          models.encode_feed_view(view) |> json.to_string,
        )
        |> task.attempt_result,
      )
      view
    }
  }
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  // Coalesce concurrent requests only; Redis retains freshness/version control.
  let pending = query_cache.new(0, 100)
  xrpc_server.method(
    server,
    "app.rocksky.feed.getFeed",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getFeed")
          |> handler.on_error(
            handler.Fallback(
              models.encode_feed_view(models.FeedView(None, None, Some([]))),
            ),
          ),
        models.get_feed_params_decoder(),
      )
      let did = handler.caller(req)
      let key =
        json.array(
          [
            models.encode_get_feed_params(params),
            json.nullable(did, json.string),
          ],
          fn(v) { v },
        )
        |> json.to_string
      query_cache.get(pending, key, fn() { cached(ctx, params, did) })
      |> task.map(models.encode_feed_view)
    },
  )
}
