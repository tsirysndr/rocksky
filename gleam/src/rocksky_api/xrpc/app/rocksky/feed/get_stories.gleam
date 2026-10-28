import gleam/dict
import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  alias, aliased_field, all, all_columns, and, asc, column, desc, distinct_on,
  eq, eq_columns, field, from, gt_columns, in_array, inner_join, left_join,
  limit, nested, now_minus_seconds, nullable, omit_column, one, order_by, pair,
  reference, scalar, select, subquery, text, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/feeds as fe
import rocksky_api/drizzle/schema/follows as fo
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/query_cache
import rocksky_api/lib/scrobble_likes
import rocksky_api/node/axios
import rocksky_api/node/xrpc_server
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

fn feed_uris(ctx: Context, uri: String) {
  let feeds = fe.table()
  use feed <- task.then(
    from(feeds)
    |> where(eq(fe.uri(feeds), uri))
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
  use response <- task.then(
    axios.get(
      axios.global(),
      url <> "/xrpc/app.rocksky.feed.getFeedSkeleton",
      axios.with_params([#("feed", feed.uri)]),
    )
    |> task.attempt_result,
  )
  decode.run(
    response.data,
    decode.field(
      "feed",
      decode.list(decode.field("scrobble", decode.string, decode.success)),
      decode.success,
    ),
  )
  |> error.decode("Stories feed skeleton", _)
  |> task.from_result
}

fn rows(ctx: Context, size: Int, conditions, window_days: Int, audience) {
  let s = sc.table()
  let t = tr.table()
  let u = us.table()
  let a = ar.table()
  let album = al.table()
  let conditions = case window_days {
    days if days > 0 -> [
      gt_columns(sc.timestamp(s), now_minus_seconds(days * 86_400)),
      ..conditions
    ]
    _ -> conditions
  }
  let latest = case audience {
    Some(ids) -> {
      // One indexed lookup per followed user, independent of their history size.
      // Keep URI conditions inside the lookup for feed + following requests.
      let candidate = alias(us.table(), "story_user")
      let latest_id =
        select(s, field("id", sc.id(s)))
        |> where(
          and([
            eq_columns(sc.user_id(s), nullable(us.id(candidate))),
            ..conditions
          ]),
        )
        |> order_by([desc(sc.timestamp(s)), desc(sc.id(s))])
        |> limit(1)
      select(candidate, aliased_field("id", scalar(latest_id, text())))
      |> where(in_array(us.id(candidate), ids))
      |> subquery("latest")
    }
    None ->
      select(s, field("id", sc.id(s)))
      |> where(and(conditions))
      |> distinct_on([reference(sc.user_id(s))])
      |> order_by([asc(sc.user_id(s)), desc(sc.timestamp(s)), desc(sc.id(s))])
      |> subquery("latest")
  }
  select(
    s,
    pair(
      nested("scrobble", all_columns(s)),
      pair(
        nested("track", all_columns(t) |> omit_column(tr.lyrics(t))),
        pair(
          nested("user", all_columns(u)),
          pair(field("artistUri", ar.uri(a)), field("albumUri", al.uri(album))),
        ),
      ),
    ),
  )
  |> inner_join(latest, eq_columns(sc.id(s), column(latest, "id", text())))
  |> left_join(t, eq_columns(sc.track_id(s), nullable(tr.id(t))))
  |> left_join(u, eq_columns(sc.user_id(s), nullable(us.id(u))))
  |> left_join(a, eq_columns(sc.artist_id(s), nullable(ar.id(a))))
  |> left_join(album, eq_columns(sc.album_id(s), nullable(al.id(album))))
  |> order_by([desc(sc.timestamp(s))])
  |> limit(size)
  |> all(ctx.db)
}

pub fn retrieve(
  ctx: Context,
  params: models.GetStoriesParams,
  did: Option(String),
) {
  let s = sc.table()
  let follows = fo.table()
  let users = us.table()
  use uris <- task.then(case params.feed {
    Some(uri) if uri != "" -> feed_uris(ctx, uri) |> task.map(Some)
    _ -> task.ok(None)
  })
  use audience <- task.then(case option.unwrap(params.following, False), did {
    True, None ->
      task.fail(error.Unauthorized(
        "Authentication required when filtering by following",
      ))
    True, Some(did) ->
      select(follows, field("id", us.id(users)))
      |> inner_join(users, eq_columns(fo.subject_did(follows), us.did(users)))
      |> where(eq(fo.follower_did(follows), did))
      |> all(ctx.db)
      |> task.map(Some)
    _, _ -> task.ok(None)
  })
  case uris, audience {
    Some([]), _ | _, Some([]) -> task.ok(models.FeedStoriesView(Some([])))
    _, _ -> {
      let conditions =
        list.append(
          case uris {
            None -> []
            Some(uris) -> [in_array(sc.uri(s), list.map(uris, Some))]
          },
          case audience {
            None -> []
            Some(ids) -> [in_array(sc.user_id(s), list.map(ids, Some))]
          },
        )
      let size = case option.unwrap(params.size, 20) {
        0 -> 20
        size -> size
      }
      // A feed already bounds the candidate set. Query it once, including
      // older entries, rather than retrying when it has fewer unique users.
      use rows <- task.then(case uris, audience {
        Some(_), _ | _, Some(_) -> rows(ctx, size, conditions, 0, audience)
        None, None -> {
          // Most pages fit within three days. Keep wider fallbacks for
          // inactive audiences and larger page sizes.
          use recent <- task.then(rows(ctx, size, conditions, 3, None))
          use recent <- task.then(case list.length(recent) < size {
            True -> rows(ctx, size, conditions, 30, None)
            False -> task.ok(recent)
          })
          case list.length(recent) < size {
            True -> rows(ctx, size, conditions, 0, None)
            False -> task.ok(recent)
          }
        }
      })
      let ids = list.map(rows, fn(r) { r.1.0.id }) |> list.unique
      use likes <- task.map(scrobble_likes.retrieve(ctx, ids, did))
      let counts = dict.from_list(likes.0)
      models.FeedStoriesView(
        Some(
          list.map(rows, fn(r) {
            let #(scrobble, #(track, #(user, #(artist_uri, album_uri)))) = r
            models.FeedStoryView(
              album: Some(track.album),
              album_art: track.album_art,
              album_artist: Some(track.album_artist),
              album_uri: album_uri,
              artist: Some(track.artist),
              artist_uri: artist_uri,
              avatar: Some(user.avatar),
              created_at: Some(row.iso8601(scrobble.timestamp)),
              did: Some(user.did),
              handle: Some(user.handle),
              id: Some(track.id),
              title: Some(track.title),
              track_id: Some(track.id),
              track_uri: track.uri,
              uri: scrobble.uri,
              liked: Some(list.contains(likes.1, track.id)),
              likes_count: Some(dict.get(counts, track.id) |> result.unwrap(0)),
            )
          }),
        ),
      )
    }
  }
}

pub fn register(server: xrpc_server.Server, ctx: Context) {
  let cache = query_cache.new(30_000, 100)
  xrpc_server.method(
    server,
    "app.rocksky.feed.getStories",
    Some(auth.verifier(ctx)),
    fn(req) {
      let did = handler.caller(req)
      case handler.params(req, models.get_stories_params_decoder()) {
        Ok(params) if params.following == Some(True) && did == None ->
          promise.resolve(xrpc_server.Fail(
            500,
            "InternalServerError",
            "Authentication required when filtering by following",
          ))
        _ -> {
          use params <- handler.query(
            req,
            handler.options("getStories") |> handler.timeout(120_000),
            models.get_stories_params_decoder(),
          )
          let did = handler.caller(req)
          let key =
            json.array(
              [
                models.encode_get_stories_params(params),
                json.nullable(did, json.string),
              ],
              fn(v) { v },
            )
            |> json.to_string
          query_cache.get(cache, key, fn() { retrieve(ctx, params, did) })
          |> task.map(models.encode_feed_stories_view)
        }
      }
    },
  )
}
