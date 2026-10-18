import gleam/dict
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, desc, eq, eq_columns, field, from, group_by, in_array, inner_join,
  limit, not_in_array, nullable, or, order_by, pair, reference, required, select,
  where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_artists as ua
import rocksky_api/drizzle/schema/users as us
import rocksky_api/lexicon/models
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/feed/get_artist_recommendations as artist_recommendations
import rocksky_api/xrpc/app/rocksky/feed/recommendation_cache
import rocksky_api/xrpc/app/rocksky/feed/recommendation_query

pub type Candidate {
  Candidate(id: String, score: Float, source: String)
}

pub fn retrieve(ctx: Context, actor: String, requested: Int) {
  let users = us.table()
  use user <- task.then(
    select(users, field("id", us.id(users)))
    |> where(or([eq(us.did(users), actor), eq(us.handle(users), actor)]))
    |> required(ctx.read_db, "User not found"),
  )
  let scrobbles = sc.table()
  let tracks = tr.table()
  use heard <- task.then(
    select(scrobbles, field("id", sc.album_id(scrobbles)))
    |> where(eq(sc.user_id(scrobbles), Some(user)))
    |> group_by([reference(sc.album_id(scrobbles))])
    |> all(ctx.read_db),
  )
  use heard_uris <- task.then(
    select(scrobbles, field("uri", tr.album_uri(tracks)))
    |> inner_join(
      tracks,
      eq_columns(sc.track_id(scrobbles), nullable(tr.id(tracks))),
    )
    |> where(eq(sc.user_id(scrobbles), Some(user)))
    |> group_by([reference(tr.album_uri(tracks))])
    |> all(ctx.read_db),
  )
  let heard = list.filter_map(heard, fn(v) { option.to_result(v, Nil) })
  let heard_uris =
    list.filter_map(heard_uris, fn(v) { option.to_result(v, Nil) })
  let history = ua.table()
  use known <- task.then(
    select(
      history,
      pair(
        field("id", ua.artist_id(history)),
        field("plays", ua.scrobbles(history)),
      ),
    )
    |> where(eq(ua.user_id(history), user))
    |> order_by([desc(ua.scrobbles(history))])
    |> limit(200)
    |> all(ctx.read_db),
  )
  let known = list.map(known, fn(r) { #(r.0, Some(option.unwrap(r.1, 0))) })
  let artist_ids = list.map(known, fn(r) { r.0 })
  use genres <- task.then(artist_recommendations.profile(ctx, user, known))
  let artists = ar.table()
  use known_rows <- task.then(
    from(artists)
    |> where(in_array(ar.id(artists), artist_ids))
    |> all(ctx.read_db),
  )
  let familiarity = dict.from_list(known)
  let scores =
    known_rows
    |> list.filter(fn(a) { string.lowercase(a.name) != "various artists" })
    |> list.filter_map(fn(a) {
      use uri <- result.try(option.to_result(a.uri, Nil))
      Ok(#(
        uri,
        dict.get(familiarity, a.id)
          |> result.unwrap(None)
          |> option.unwrap(1)
          |> int.to_float,
      ))
    })
    |> dict.from_list
  use main <- task.then(albums(ctx, scores, heard, heard_uris, "known-artist"))
  use new_scores <- task.then(recommendation_query.artist_scores(
    ctx,
    user,
    artist_ids,
    150,
  ))
  use new_artists <- task.then(
    from(artists)
    |> where(in_array(ar.id(artists), dict.keys(new_scores)))
    |> all(ctx.read_db),
  )
  let scores =
    new_artists
    |> list.filter(fn(a) {
      string.lowercase(a.name) != "various artists"
      && {
        genres == []
        || list.any(option.unwrap(a.genres, []), fn(g) {
          list.contains(genres, g)
        })
      }
    })
    |> list.filter_map(fn(a) {
      use uri <- result.try(option.to_result(a.uri, Nil))
      Ok(#(uri, dict.get(new_scores, a.id) |> result.unwrap(0.0)))
    })
    |> dict.from_list
  use extra <- task.then(albums(ctx, scores, heard, heard_uris, "new-artist"))
  let main_ids = list.map(main, fn(c) { c.id })
  let candidates =
    list.append(
      main,
      list.filter(extra, fn(c) { !list.contains(main_ids, c.id) }),
    )
    |> list.sort(fn(a, b) { float.compare(b.score, a.score) })
    |> list.unique
    |> list.take(int.min(requested, 100))
  let albums = al.table()
  use rows <- task.map(
    from(albums)
    |> where(in_array(al.id(albums), list.map(candidates, fn(c) { c.id })))
    |> all(ctx.read_db),
  )
  let rows = list.map(rows, fn(a) { #(a.id, a) }) |> dict.from_list
  let views =
    list.filter_map(candidates, fn(c) {
      use a <- result.try(dict.get(rows, c.id))
      case string.lowercase(a.artist) == "various artists" {
        True -> Error(Nil)
        False ->
          Ok(models.FeedRecommendedAlbumView(
            Some(a.id),
            a.uri,
            Some(a.title),
            Some(a.artist),
            a.artist_uri,
            a.year,
            a.album_art,
            Some(c.source),
            Some(c.score),
          ))
      }
    })
  models.FeedRecommendedAlbumsView(Some(views), None)
}

fn albums(ctx: Context, scores, heard, heard_uris, source) {
  let albums = al.table()
  use rows <- task.map(
    select(
      albums,
      pair(field("id", al.id(albums)), field("artist", al.artist_uri(albums))),
    )
    |> where(
      and([
        in_array(al.artist_uri(albums), dict.keys(scores) |> list.map(Some)),
        not_in_array(al.id(albums), heard),
        case heard_uris {
          [] -> and([])
          _ -> not_in_array(al.uri(albums), list.map(heard_uris, Some))
        },
      ]),
    )
    |> limit(500)
    |> all(ctx.read_db),
  )
  list.filter_map(rows, fn(r) {
    use uri <- result.try(option.to_result(r.1, Nil))
    Ok(Candidate(r.0, result.unwrap(dict.get(scores, uri), 0.0), source))
  })
}

pub fn register(server, ctx: Context) {
  recommendation_cache.register(
    server,
    "app.rocksky.feed.getAlbumRecommendations",
    "/v1/recommendations/albums",
    "albums",
    models.get_album_recommendations_params_decoder(),
    fn(params) { #(params.did, option.unwrap(params.limit, 50)) },
    fn(actor, size) {
      retrieve(ctx, actor, size)
      |> task.map(models.encode_feed_recommended_albums_view)
    },
  )
}
