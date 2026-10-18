import gleam/dict
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, array_overlaps, count, decayed_count, desc, eq,
  eq_columns, field, from, group_by, in_array, inner_join, left_join, limit,
  lower, ne, nested, not_in_array, omit_column, or, order_by, pair, random_order,
  reference, required, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/loved_tracks as lt
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
  use heard <- task.then(
    select(scrobbles, field("id", sc.track_id(scrobbles)))
    |> where(eq(sc.user_id(scrobbles), Some(user)))
    |> group_by([reference(sc.track_id(scrobbles))])
    |> all(ctx.read_db),
  )
  let loved = lt.table()
  use liked <- task.then(
    select(loved, field("id", lt.track_id(loved)))
    |> where(eq(lt.user_id(loved), user))
    |> all(ctx.db),
  )
  let excluded =
    list.append(
      list.filter_map(heard, fn(v) { option.to_result(v, Nil) }),
      liked,
    )
    |> list.unique
  use artists <- task.then(
    select(scrobbles, field("id", sc.artist_id(scrobbles)))
    |> where(eq(sc.user_id(scrobbles), Some(user)))
    |> group_by([reference(sc.artist_id(scrobbles))])
    |> order_by([desc(decayed_count(sc.timestamp(scrobbles), 0.02))])
    |> limit(200)
    |> all(ctx.read_db),
  )
  let artists = list.filter_map(artists, fn(v) { option.to_result(v, Nil) })
  case artists {
    [] -> task.ok(models.FeedRecommendationsView(Some([]), None))
    _ -> {
      let history = ua.table()
      let artist_table = ar.table()
      use known <- task.then(
        select(
          history,
          pair(
            field("id", ua.artist_id(history)),
            field("plays", ua.scrobbles(history)),
          ),
        )
        |> inner_join(
          artist_table,
          eq_columns(ua.artist_id(history), ar.id(artist_table)),
        )
        |> where(eq(ua.user_id(history), user))
        |> order_by([desc(ua.scrobbles(history))])
        |> limit(200)
        |> all(ctx.read_db),
      )
      use genres <- task.then(artist_recommendations.profile(ctx, user, known))
      use neighbours <- task.then(recommendation_query.neighbours(
        ctx,
        user,
        artists,
      ))
      case dict.size(neighbours) {
        0 -> task.ok(models.FeedRecommendationsView(Some([]), None))
        _ -> {
          use liked <- task.then(
            select(
              loved,
              pair(
                field("id", lt.track_id(loved)),
                field("user", lt.user_id(loved)),
              ),
            )
            |> where(
              and([
                in_array(lt.user_id(loved), dict.keys(neighbours)),
                not_in_array(lt.track_id(loved), excluded),
              ]),
            )
            |> all(ctx.db),
          )
          use plays <- task.then(recommendation_query.plays(
            ctx,
            dict.keys(neighbours),
            excluded,
            False,
            500,
          ))
          let scores =
            list.fold(plays, dict.new(), fn(acc, r) {
              case r.0, r.1.0 {
                Some(id), Some(user) -> {
                  let is_loved = list.contains(liked, #(id, user))
                  let score =
                    result.unwrap(dict.get(neighbours, user), 0.0)
                    *. r.1.1
                    *. case is_loved {
                      True -> 5.0
                      False -> 1.0
                    }
                  let old =
                    dict.get(acc, id)
                    |> result.map(fn(c: Candidate) { c.score })
                    |> result.unwrap(0.0)
                  case !list.contains(excluded, id) && score >. old {
                    True ->
                      dict.insert(
                        acc,
                        id,
                        Candidate(id, score, case is_loved {
                          True -> "social"
                          False -> "neighbour"
                        }),
                      )
                    False -> acc
                  }
                }
                _, _ -> acc
              }
            })
          let scores =
            list.fold(liked, scores, fn(acc, r) {
              case dict.has_key(acc, r.0) || list.contains(excluded, r.0) {
                True -> acc
                False ->
                  dict.insert(
                    acc,
                    r.0,
                    Candidate(
                      r.0,
                      result.unwrap(dict.get(neighbours, r.1), 0.0) *. 5.0,
                      "social",
                    ),
                  )
              }
            })
          use scores <- task.then(filter_scores(ctx, scores, genres))
          let size = int.min(requested, 100)
          let surprise =
            int.to_float(size) *. 0.15 |> float.ceiling |> float.truncate
          let main_count = size - surprise
          let main =
            dict.values(scores)
            |> list.sort(fn(a, b) { float.compare(b.score, a.score) })
            |> list.take(main_count)
          use extra <- task.then(supplement(
            ctx,
            excluded,
            list.map(main, fn(c) { c.id }),
            genres,
            main_count - list.length(main),
          ))
          let main = list.append(main, extra)
          use extra <- task.then(serendipity(
            ctx,
            dict.keys(neighbours),
            artists,
            excluded,
            list.map(main, fn(c) { c.id }),
            genres,
            surprise,
          ))
          hydrate(ctx, list.append(main, extra), genres)
        }
      }
    }
  }
}

fn matches(genres, profile) {
  list.any(option.unwrap(genres, []), fn(g) { list.contains(profile, g) })
}

fn filter_scores(ctx: Context, scores, genres) {
  case genres == [] || dict.size(scores) == 0 {
    True -> task.ok(scores)
    False -> {
      let tracks = tr.table()
      let artists = ar.table()
      use rows <- task.map(
        select(
          tracks,
          pair(
            field("id", tr.id(tracks)),
            pair(
              field("artist", tr.artist(tracks)),
              field("genres", ar.genres(artists)),
            ),
          ),
        )
        |> left_join(
          artists,
          eq_columns(tr.artist_uri(tracks), ar.uri(artists)),
        )
        |> where(in_array(tr.id(tracks), dict.keys(scores)))
        |> all(ctx.read_db),
      )
      let ids =
        rows
        |> list.filter(fn(r) {
          string.lowercase(r.1.0) != "various artists" && matches(r.1.1, genres)
        })
        |> list.map(fn(r) { r.0 })
      dict.filter(scores, fn(id, _) { list.contains(ids, id) })
    }
  }
}

fn supplement(ctx: Context, excluded, returned, genres, needed) {
  case needed > 0 && genres != [] {
    False -> task.ok([])
    True -> {
      let tracks = tr.table()
      let artists = ar.table()
      use rows <- task.map(
        select(tracks, field("id", tr.id(tracks)))
        |> inner_join(
          artists,
          eq_columns(tr.artist_uri(tracks), ar.uri(artists)),
        )
        |> where(
          and([
            array_overlaps(ar.genres(artists), genres),
            ne(lower(ar.name(artists)), "various artists"),
            not_in_array(tr.id(tracks), list.take(excluded, 500)),
          ]),
        )
        |> order_by([random_order()])
        |> limit(needed * 5)
        |> all(ctx.read_db),
      )
      rows
      |> list.filter(fn(id) {
        !list.contains(returned, id) && !list.contains(excluded, id)
      })
      |> list.take(needed)
      |> list.map(fn(id) { Candidate(id, 0.0, "serendipity") })
    }
  }
}

fn serendipity(
  ctx: Context,
  neighbours,
  known,
  excluded,
  returned,
  genres,
  size,
) {
  let scrobbles = sc.table()
  use ids <- task.then(
    select(scrobbles, field("id", sc.artist_id(scrobbles)))
    |> where(
      and([
        in_array(sc.user_id(scrobbles), list.map(neighbours, Some)),
        not_in_array(sc.artist_id(scrobbles), list.map(known, Some)),
      ]),
    )
    |> group_by([reference(sc.artist_id(scrobbles))])
    |> order_by([desc(count())])
    |> limit(150)
    |> all(ctx.read_db),
  )
  let artists = ar.table()
  use rows <- task.then(
    from(artists)
    |> where(in_array(
      ar.id(artists),
      list.filter_map(ids, fn(v) { option.to_result(v, Nil) }),
    ))
    |> all(ctx.read_db),
  )
  let uris =
    rows
    |> list.filter(fn(a) {
      string.lowercase(a.name) != "various artists"
      && { genres == [] || matches(a.genres, genres) }
    })
    |> list.filter_map(fn(a) { option.to_result(a.uri, Nil) })
  let tracks = tr.table()
  use rows <- task.map(
    select(tracks, field("id", tr.id(tracks)))
    |> where(
      and([
        in_array(tr.artist_uri(tracks), list.map(uris, Some)),
        not_in_array(tr.id(tracks), excluded),
      ]),
    )
    |> order_by([random_order()])
    |> limit(size * 3)
    |> all(ctx.read_db),
  )
  rows
  |> list.filter(fn(id) { !list.contains(returned, id) })
  |> list.take(size)
  |> list.map(fn(id) { Candidate(id, 0.0, "serendipity") })
}

fn hydrate(ctx: Context, candidates: List(Candidate), genres) {
  let tracks = tr.table()
  let artists = ar.table()
  let albums = al.table()
  let ids = list.map(candidates, fn(c) { c.id })
  use rows <- task.then(
    select(
      tracks,
      pair(
        nested("track", all_columns(tracks) |> omit_column(tr.lyrics(tracks))),
        pair(
          field("artistUri", ar.uri(artists)),
          pair(
            field("albumUri", al.uri(albums)),
            field("genres", ar.genres(artists)),
          ),
        ),
      ),
    )
    |> left_join(artists, eq_columns(tr.artist_uri(tracks), ar.uri(artists)))
    |> left_join(albums, eq_columns(tr.album_uri(tracks), al.uri(albums)))
    |> where(in_array(tr.id(tracks), ids))
    |> all(ctx.read_db),
  )
  let loved = lt.table()
  use likes <- task.map(
    select(
      loved,
      pair(field("id", lt.track_id(loved)), field("count", count())),
    )
    |> where(in_array(lt.track_id(loved), ids))
    |> group_by([reference(lt.track_id(loved))])
    |> all(ctx.db),
  )
  let likes = dict.from_list(likes)
  let rows = list.map(rows, fn(r) { #(r.0.id, r) }) |> dict.from_list
  let views =
    candidates
    |> list.sort(fn(a, b) { float.compare(b.score, a.score) })
    |> list.filter_map(fn(c) {
      use r <- result.try(dict.get(rows, c.id))
      let track = r.0
      case
        string.lowercase(track.artist) != "various artists"
        && { genres == [] || matches(r.1.1.1, genres) }
      {
        False -> Error(Nil)
        True ->
          Ok(#(
            option.unwrap(r.1.0, track.id),
            models.FeedRecommendationView(
              Some(track.title),
              Some(track.artist),
              Some(track.album),
              track.album_art,
              track.uri,
              r.1.0,
              r.1.1.0,
              Some(option.unwrap(r.1.1.1, [])),
              Some(c.source),
              Some(result.unwrap(dict.get(likes, track.id), 0)),
              Some(c.score),
            ),
          ))
      }
    })
  let #(_, unique, overflow) =
    list.fold(views, #([], [], []), fn(acc, r) {
      case list.contains(acc.0, r.0) {
        True -> #(acc.0, acc.1, [r.1, ..acc.2])
        False -> #([r.0, ..acc.0], [r.1, ..acc.1], acc.2)
      }
    })
  models.FeedRecommendationsView(
    Some(list.append(list.reverse(unique), list.reverse(overflow))),
    None,
  )
}

pub fn register(server, ctx: Context) {
  recommendation_cache.register(
    server,
    "app.rocksky.feed.getRecommendations",
    "/v1/recommendations",
    "recommendations",
    models.get_recommendations_params_decoder(),
    fn(params) { #(params.did, option.unwrap(params.limit, 50)) },
    fn(actor, size) {
      retrieve(ctx, actor, size)
      |> task.map(models.encode_feed_recommendations_view)
    },
  )
}
