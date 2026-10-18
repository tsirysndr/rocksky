import gleam/dict
import gleam/float
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, array_overlaps, count_distinct, decayed_count, desc, eq, eq_columns,
  field, from, group_by, in_array, left_join, limit, lower, ne, not_in_array, or,
  order_by, pair, random_order, reference, required, select, where,
}
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_artists as ua
import rocksky_api/drizzle/schema/users as us
import rocksky_api/lexicon/models
import rocksky_api/task
import rocksky_api/xrpc/app/rocksky/feed/recommendation_cache

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
  let heard = ua.table()
  use history <- task.then(
    select(
      heard,
      pair(
        field("id", ua.artist_id(heard)),
        field("plays", ua.scrobbles(heard)),
      ),
    )
    |> where(eq(ua.user_id(heard), user))
    |> all(ctx.read_db),
  )
  let ids = list.map(history, fn(r) { r.0 })
  case ids {
    [] -> task.ok(models.FeedRecommendedArtistsView(Some([]), None))
    _ -> {
      use genres <- task.then(profile(ctx, user, history))
      let scrobbles = sc.table()
      use neighbours <- task.then(
        select(
          scrobbles,
          pair(
            field("id", sc.user_id(scrobbles)),
            field("shared", count_distinct(sc.artist_id(scrobbles))),
          ),
        )
        |> where(
          and([
            in_array(sc.artist_id(scrobbles), list.map(ids, Some)),
            ne(sc.user_id(scrobbles), Some(user)),
          ]),
        )
        |> group_by([reference(sc.user_id(scrobbles))])
        |> order_by([desc(count_distinct(sc.artist_id(scrobbles)))])
        |> limit(50)
        |> all(ctx.read_db),
      )
      let neighbour_ids =
        list.filter_map(neighbours, fn(r) { option.to_result(r.0, Nil) })
      case neighbour_ids {
        [] -> task.ok(models.FeedRecommendedArtistsView(Some([]), None))
        _ -> {
          let similarities =
            list.map(neighbours, fn(r) {
              #(r.0, int.to_float(r.1) /. int.to_float(list.length(ids)))
            })
            |> dict.from_list
          let score = decayed_count(sc.timestamp(scrobbles), 0.02)
          use plays <- task.then(
            select(
              scrobbles,
              pair(
                field("artist", sc.artist_id(scrobbles)),
                pair(
                  field("user", sc.user_id(scrobbles)),
                  field("score", score),
                ),
              ),
            )
            |> where(
              and([
                in_array(sc.user_id(scrobbles), list.map(neighbour_ids, Some)),
                not_in_array(
                  sc.artist_id(scrobbles),
                  list.take(ids, 500) |> list.map(Some),
                ),
              ]),
            )
            |> group_by([
              reference(sc.artist_id(scrobbles)),
              reference(sc.user_id(scrobbles)),
            ])
            |> order_by([desc(score)])
            |> limit(500)
            |> all(ctx.read_db),
          )
          let scores =
            list.fold(plays, dict.new(), fn(acc, r) {
              case r.0, r.1.0 {
                Some(id), Some(_) ->
                  case list.contains(ids, id) {
                    True -> acc
                    False -> {
                      let score =
                        result.unwrap(dict.get(similarities, r.1.0), 0.0)
                        *. r.1.1
                      case score >. result.unwrap(dict.get(acc, id), 0.0) {
                        True -> dict.insert(acc, id, score)
                        False -> acc
                      }
                    }
                  }
                _, _ -> acc
              }
            })
          use scores <- task.then(filter_scores(ctx, scores, genres))
          let ranked =
            dict.to_list(scores)
            |> list.sort(fn(a, b) { float.compare(b.1, a.1) })
          let size = int.min(requested, 100)
          let surprise_count =
            int.to_float(size) *. 0.15 |> float.ceiling |> float.truncate
          let main_count = size - surprise_count
          let main =
            list.take(ranked, main_count)
            |> list.map(fn(r) { Candidate(r.0, r.1, "neighbour") })
          use supplemental <- task.then(supplement(
            ctx,
            ids,
            list.map(main, fn(c) { c.id }),
            genres,
            main_count - list.length(main),
            300,
          ))
          let main = list.append(main, supplemental)
          let returned = list.map(main, fn(c) { c.id })
          let surprise =
            ranked
            |> list.drop(main_count)
            |> list.take(surprise_count * 3)
            |> list.filter(fn(r) { !list.contains(returned, r.0) })
            |> list.take(surprise_count)
            |> list.map(fn(r) { Candidate(r.0, r.1, "serendipity") })
          // The legacy query excludes main candidates but does not exclude the
          // scored serendipity tail from its supplemental query.
          use extra <- task.then(supplement(
            ctx,
            ids,
            returned,
            genres,
            surprise_count - list.length(surprise),
            100,
          ))
          hydrate(ctx, list.flatten([main, surprise, extra]), genres)
        }
      }
    }
  }
}

pub fn profile(
  ctx: Context,
  user: String,
  history: List(#(String, option.Option(Int))),
) {
  let loved = lt.table()
  use loved_ids <- task.then(
    select(loved, field("id", lt.track_id(loved)))
    |> where(eq(lt.user_id(loved), user))
    |> all(ctx.db),
  )
  let artists = ar.table()
  let tracks = tr.table()
  use rows <- task.then(
    select(
      artists,
      pair(field("id", ar.id(artists)), field("genres", ar.genres(artists))),
    )
    |> where(in_array(ar.id(artists), list.map(history, fn(r) { r.0 })))
    |> all(ctx.read_db),
  )
  use liked <- task.map(case loved_ids {
    [] -> task.ok([])
    _ ->
      select(tracks, field("genres", ar.genres(artists)))
      |> left_join(artists, eq_columns(tr.artist_uri(tracks), ar.uri(artists)))
      |> where(in_array(
        tr.id(tracks),
        loved_ids
          |> list.take(200),
      ))
      |> all(ctx.read_db)
  })
  let familiarity = dict.from_list(history)
  let weights =
    list.fold(rows, dict.new(), fn(acc, row) {
      let weight =
        dict.get(familiarity, row.0)
        |> result.unwrap(None)
        |> option.unwrap(1)
        |> int.to_float
      list.fold(option.unwrap(row.1, []), acc, fn(acc, genre) {
        add_weight(acc, genre, weight)
      })
    })
  let weights =
    list.fold(
      list.flat_map(liked, fn(g) { option.unwrap(g, []) }),
      weights,
      fn(acc, genre) { add_weight(acc, genre, 50.0) },
    )
  let total = dict.values(weights) |> list.fold(0.0, fn(a, b) { a +. b })
  let total = case total == 0.0 {
    True -> 1.0
    False -> total
  }
  weights
  |> dict.to_list
  |> list.sort(fn(a, b) { float.compare(b.1, a.1) })
  |> list.filter(fn(r) { r.1 /. total >=. 0.05 })
  |> list.take(10)
  |> list.map(fn(r) { r.0 })
}

fn add_weight(weights, genre, weight) {
  dict.insert(
    weights,
    genre,
    result.unwrap(dict.get(weights, genre), 0.0) +. weight,
  )
}

fn matches(genres, profile) {
  list.any(option.unwrap(genres, []), fn(g) { list.contains(profile, g) })
}

fn filter_scores(ctx: Context, scores, genres) {
  case genres == [] || dict.size(scores) == 0 {
    True -> task.ok(scores)
    False -> {
      let artists = ar.table()
      use rows <- task.map(
        from(artists)
        |> where(in_array(ar.id(artists), dict.keys(scores)))
        |> all(ctx.read_db),
      )
      let ids =
        list.filter(rows, fn(a) {
          string.lowercase(a.name) != "various artists"
          && matches(a.genres, genres)
        })
        |> list.map(fn(a) { a.id })
      dict.filter(scores, fn(id, _) { list.contains(ids, id) })
    }
  }
}

fn supplement(ctx: Context, heard, returned, genres, needed, minimum) {
  case needed > 0 && genres != [] {
    False -> task.ok([])
    True -> {
      let artists = ar.table()
      use rows <- task.map(
        select(artists, field("id", ar.id(artists)))
        |> where(
          and([
            array_overlaps(ar.genres(artists), genres),
            ne(lower(ar.name(artists)), "various artists"),
            not_in_array(ar.id(artists), list.take(heard, 2000)),
          ]),
        )
        |> order_by([random_order()])
        |> limit(int.max(needed * 20, minimum))
        |> all(ctx.read_db),
      )
      rows
      |> list.filter(fn(id) {
        !list.contains(heard, id) && !list.contains(returned, id)
      })
      |> list.take(needed)
      |> list.map(fn(id) { Candidate(id, 0.0, "serendipity") })
    }
  }
}

fn hydrate(ctx: Context, candidates: List(Candidate), genres) {
  let artists = ar.table()
  use rows <- task.map(
    from(artists)
    |> where(in_array(ar.id(artists), list.map(candidates, fn(c) { c.id })))
    |> all(ctx.read_db),
  )
  let artists = list.map(rows, fn(a) { #(a.id, a) }) |> dict.from_list
  // A duplicate supplemental ID uses its final score/source, as Map does in TS.
  let scores = list.map(candidates, fn(c) { #(c.id, c) }) |> dict.from_list
  let items =
    list.filter_map(candidates, fn(candidate) {
      use artist <- result.try(dict.get(artists, candidate.id))
      let candidate = dict.get(scores, candidate.id) |> result.unwrap(candidate)
      case
        string.lowercase(artist.name) != "various artists"
        && { genres == [] || matches(artist.genres, genres) }
      {
        False -> Error(Nil)
        True ->
          Ok(models.FeedRecommendedArtistView(
            Some(artist.id),
            artist.uri,
            Some(artist.name),
            artist.picture,
            Some(option.unwrap(artist.genres, [])),
            Some(candidate.source),
            Some(candidate.score),
          ))
      }
    })
  models.FeedRecommendedArtistsView(Some(items), None)
}

pub fn register(server, ctx: Context) {
  recommendation_cache.register(
    server,
    "app.rocksky.feed.getArtistRecommendations",
    "/v1/recommendations/artists",
    "artists",
    models.get_artist_recommendations_params_decoder(),
    fn(params) { #(params.did, option.unwrap(params.limit, 50)) },
    fn(actor, size) {
      retrieve(ctx, actor, size)
      |> task.map(models.encode_feed_recommended_artists_view)
    },
  )
}
