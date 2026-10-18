import gleam/dict
import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  aliased_field, all, all_columns, and, asc, count, desc, eq, eq_columns, field,
  group_by, in_array, inner_join, integer_as_real, left_join, limit, nested,
  nullable, offset, omit_column, order_by, pair, reference, select, to_sql,
  where,
}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/follows as f
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/scrobbles as s
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/json_value
import rocksky_api/lexicon/models
import rocksky_api/lib/feed_cache
import rocksky_api/lib/filtered_page
import rocksky_api/node/redis
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/handler

fn fields() {
  let tracks = t.table()
  let users = u.table()
  let artists = a.table()
  let scrobbles = s.table()
  dict.from_list([
    #("uri", rsql.Text(s.uri(scrobbles))),
    #("date", rsql.Date(nullable(s.timestamp(scrobbles)))),
    #("timestamp", rsql.Date(nullable(s.timestamp(scrobbles)))),
    #("title", rsql.Text(nullable(t.title(tracks)))),
    #("artist", rsql.Text(nullable(t.artist(tracks)))),
    #("album", rsql.Text(nullable(t.album(tracks)))),
    #("track.title", rsql.Text(nullable(t.title(tracks)))),
    #("track.artist", rsql.Text(nullable(t.artist(tracks)))),
    #("track.album", rsql.Text(nullable(t.album(tracks)))),
    #("track.albumArtist", rsql.Text(nullable(t.album_artist(tracks)))),
    #("track.genre", rsql.Text(t.genre(tracks))),
    #(
      "track.duration",
      rsql.Number(integer_as_real(nullable(t.duration(tracks)))),
    ),
    #("track.isrc", rsql.Text(t.isrc(tracks))),
    #("track.mbId", rsql.Text(t.mb_id(tracks))),
    #("user.did", rsql.Text(nullable(u.did(users)))),
    #("user.handle", rsql.Text(nullable(u.handle(users)))),
    #("user.displayName", rsql.Text(u.display_name(users))),
    #("artist.name", rsql.Text(nullable(a.name(artists)))),
    #("artist.genres", rsql.TextArray(a.genres(artists))),
  ])
}

pub fn register(server: Server, ctx: Context) -> Nil {
  let fallback =
    models.GetScrobblesOutput(Some([])) |> models.encode_get_scrobbles_output
  xrpc_server.method(server, "app.rocksky.scrobble.getScrobbles", None, fn(req) {
    case handler.params(req, models.get_scrobbles_params_decoder()) {
      Error(e) -> promise.resolve(xrpc_server.fail(e))
      Ok(params) ->
        case rsql.compile(params.filter, fields()) {
          Error(message) ->
            promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
          Ok(filter) -> {
            use <- handler.run(
              handler.options("getScrobbles")
              |> handler.no_retry
              |> handler.timeout(20_000)
              |> handler.on_error(handler.Fallback(fallback)),
            )
            use version <- task.then(feed_cache.scrobbles_version(ctx))
            let key =
              "scrobbles:getScrobbles:v2:"
              <> int.to_string(version)
              <> ":"
              <> option.unwrap(params.did, "anon")
              <> ":"
              <> {
                case option.unwrap(params.following, False) {
                  True -> "1"
                  False -> "0"
                }
              }
              <> ":"
              <> option.unwrap(option.map(params.limit, int.to_string), "")
              <> ":"
              <> option.unwrap(option.map(params.offset, int.to_string), "")
              <> ":"
              <> option.unwrap(params.filter, "")
            use cached <- task.then(
              task.attempt_result(redis.get(ctx.redis, key)),
            )
            case cached {
              Some(cached) ->
                case json.parse(cached, models.get_scrobbles_output_decoder()) {
                  Ok(view) -> task.ok(models.encode_get_scrobbles_output(view))
                  Error(_) -> task.ok(fallback)
                }
              None -> {
                use rows <- task.then(retrieve(ctx, params, filter))
                let view =
                  models.GetScrobblesOutput(Some(rows))
                  |> models.encode_get_scrobbles_output
                use _ <- task.map(
                  task.attempt_result(redis.set_ex(
                    ctx.redis,
                    key,
                    30,
                    json.to_string(view),
                  )),
                )
                view
              }
            }
          }
        }
    }
  })
}

fn joined(selection) {
  let scrobbles = s.table()
  let tracks = t.table()
  let users = u.table()
  let artists = a.table()
  select(scrobbles, selection)
  |> left_join(
    tracks,
    eq_columns(s.track_id(scrobbles), nullable(t.id(tracks))),
  )
  |> left_join(users, eq_columns(s.user_id(scrobbles), nullable(u.id(users))))
  |> left_join(
    artists,
    eq_columns(s.artist_id(scrobbles), nullable(a.id(artists))),
  )
}

fn retrieve(ctx: Context, params: models.GetScrobblesParams, filter) {
  let scrobbles = s.table()
  let tracks = t.table()
  let users = u.table()
  let artists = a.table()
  let follows = f.table()
  use audience <- task.then(
    case params.did, option.unwrap(params.following, False) {
      Some(did), True if did != "" ->
        select(follows, field("id", u.id(users)))
        |> inner_join(users, eq_columns(f.subject_did(follows), u.did(users)))
        |> where(eq(f.follower_did(follows), did))
        |> all(ctx.db)
        |> task.map(Some)
      _, _ -> task.ok(None)
    },
  )
  case audience {
    Some([]) -> task.ok([])
    _ -> {
      let conditions = case filter {
        None -> []
        Some(c) -> [c]
      }
      let conditions = case audience {
        None -> conditions
        Some(ids) -> [
          in_array(s.user_id(scrobbles), list.map(ids, Some)),
          ..conditions
        ]
      }
      let size = case option.unwrap(params.limit, 20) {
        0 -> 20
        n -> n
      }
      let start = option.unwrap(params.offset, 0)
      let base =
        joined(pair(
          nested("scrobble", all_columns(scrobbles)),
          pair(
            nested(
              "track",
              all_columns(tracks) |> omit_column(t.lyrics(tracks)),
            ),
            pair(
              nested("user", all_columns(users)),
              field("genres", a.genres(artists)),
            ),
          ),
        ))
      use rows <- task.then(case string.trim(option.unwrap(params.filter, "")) {
        "" ->
          base
          |> where(and(conditions))
          |> order_by([desc(s.timestamp(scrobbles))])
          |> limit(size)
          |> offset(start)
          |> all(ctx.db)
        _ -> {
          let candidates =
            joined(pair(
              aliased_field("id", s.id(scrobbles)),
              aliased_field("created_at", s.timestamp(scrobbles)),
            ))
            |> where(and(conditions))
            |> to_sql
          use ids <- task.then(filtered_page.run(
            ctx.db,
            candidates.sql,
            candidates.params,
            size,
            start,
          ))
          case ids {
            [] -> task.ok([])
            _ ->
              base
              |> where(in_array(s.id(scrobbles), ids))
              |> order_by([desc(s.timestamp(scrobbles)), asc(s.id(scrobbles))])
              |> all(ctx.db)
          }
        }
      })
      let ids = list.map(rows, fn(r) { r.1.0.id }) |> list.unique
      let loved = lt.table()
      use likes <- task.map(case ids {
        [] -> task.ok(#([], []))
        _ ->
          task.all2(
            select(
              loved,
              pair(field("id", lt.track_id(loved)), field("count", count())),
            )
              |> where(in_array(lt.track_id(loved), ids))
              |> group_by([reference(lt.track_id(loved))])
              |> all(ctx.db),
            case params.did {
              None | Some("") -> task.ok([])
              Some(did) ->
                select(loved, field("id", lt.track_id(loved)))
                |> inner_join(users, eq_columns(lt.user_id(loved), u.id(users)))
                |> where(
                  and([in_array(lt.track_id(loved), ids), eq(u.did(users), did)]),
                )
                |> all(ctx.db)
            },
          )
      })
      let counts = dict.from_list(likes.0)
      list.map(rows, fn(r) {
        let #(scrobble, #(track, #(user, genres))) = r
        models.ScrobbleViewBasic(
          ..models.new_scrobble_view_basic(),
          id: Some(scrobble.id),
          title: Some(track.title),
          artist: Some(track.artist),
          album: Some(track.album),
          artist_uri: track.artist_uri,
          album_uri: track.album_uri,
          album_artist: Some(track.album_artist),
          track_uri: track.uri,
          uri: scrobble.uri,
          cover: track.album_art,
          date: Some(row.iso8601(scrobble.timestamp)),
          created_at: Some(row.iso8601(scrobble.timestamp)),
          user: Some(user.handle),
          user_display_name: user.display_name,
          user_avatar: Some(user.avatar),
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
          updated_at: Some(json_value.String(row.iso8601(track.updated_at))),
        )
      })
    }
  }
}
