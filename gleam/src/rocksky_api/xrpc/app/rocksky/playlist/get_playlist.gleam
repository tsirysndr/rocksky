import gleam/dict
import gleam/javascript/promise
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, and, asc, count, eq, eq_columns, field, left_join, one,
  order_by, select, where,
}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as p
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_playlists as up
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/playlists
import rocksky_api/lib/track_likes
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/song
import rocksky_api/xrpc/app/rocksky/song/get_songs
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  let fields =
    get_songs.fields()
    |> dict.delete("createdAt")
    |> dict.insert("addedAt", rsql.Date(pt.added_at(pt.table())))
  let fallback =
    models.new_playlist_view_detailed() |> models.encode_playlist_view_detailed
  xrpc_server.method(
    server,
    "app.rocksky.playlist.getPlaylist",
    Some(auth.verifier(ctx)),
    fn(req) {
      case handler.params(req, models.playlist_get_playlist_params_decoder()) {
        Error(e) -> promise.resolve(xrpc_server.fail(e))
        Ok(params) ->
          case rsql.compile(params.filter, fields) {
            Error(message) ->
              promise.resolve(xrpc_server.Fail(400, "InvalidFilter", message))
            Ok(filter) -> {
              use <- handler.run(
                handler.options("getPlaylist")
                |> handler.on_error(handler.Fallback(fallback)),
              )
              use view <- task.map(retrieve(
                ctx,
                params.uri,
                filter,
                handler.caller(req),
              ))
              models.encode_playlist_view_detailed(view)
            }
          }
      }
    },
  )
}

pub fn canonical_uri(ctx: Context, uri: String) {
  let path = case string.starts_with(uri, "at://") {
    True -> string.drop_start(uri, 5)
    False -> uri
  }
  case string.split(path, "/") {
    [authority, collection, key, ..] if authority != "" && key != "" ->
      case string.starts_with(authority, "did:") {
        True -> task.ok(uri)
        False -> {
          let users = u.table()
          use did <- task.map(
            select(users, field("did", u.did(users)))
            |> where(eq(u.handle(users), authority))
            |> one(ctx.db),
          )
          case did {
            None -> uri
            Some(did) -> "at://" <> did <> "/" <> collection <> "/" <> key
          }
        }
      }
    _ -> task.ok(uri)
  }
}

fn retrieve(ctx: Context, uri: String, filter, did) {
  use uri <- task.then(canonical_uri(ctx, uri))
  let playlists_table = p.table()
  let users = u.table()
  let memberships = up.table()
  let entries = pt.table()
  let tracks = t.table()
  use owner <- task.then(
    select(memberships, playlists.selection(playlists_table, users))
    |> left_join(
      playlists_table,
      eq_columns(up.playlist_id(memberships), p.id(playlists_table)),
    )
    |> left_join(users, eq_columns(up.user_id(memberships), u.id(users)))
    |> where(eq(p.uri(playlists_table), Some(uri)))
    |> one(ctx.db),
  )
  case owner {
    None -> task.fail(error.NotFound("Playlist not found: " <> uri))
    Some(#(playlist, curator)) -> {
      use data <- task.then(task.all2(
        select(entries, all_columns(tracks))
          |> left_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
          |> where(
            and([
              eq(pt.playlist_id(entries), playlist.id),
              ..case filter {
                None -> []
                Some(c) -> [c]
              }
            ]),
          )
          |> order_by([asc(pt.added_at(entries)), asc(pt.created_at(entries))])
          |> all(ctx.db),
        select(entries, field("count", count()))
          |> where(eq(pt.playlist_id(entries), playlist.id))
          |> one(ctx.db),
      ))
      use likes <- task.map(track_likes.for_track_ids(
        ctx,
        list.map(data.0, fn(track) { track.id }),
        did,
      ))
      let tracks =
        list.map(data.0, fn(track) {
          let like =
            dict.get(likes, track.id)
            |> result.unwrap(track_likes.Likes(0, False))
          models.SongViewBasic(
            ..song.basic(track),
            likes_count: Some(like.likes_count),
            liked: Some(like.liked),
          )
        })
      models.PlaylistViewDetailed(
        ..models.new_playlist_view_detailed(),
        id: Some(playlist.id),
        title: Some(playlist.name),
        uri: playlist.uri,
        description: playlist.description,
        cover_image_url: playlist.picture,
        curator_d_id: curator.did,
        curator_handle: curator.handle,
        curator_name: curator.display_name,
        curator_avatar_url: curator.avatar,
        created_at: Some(row.iso8601(playlist.created_at)),
        updated_at: Some(row.iso8601(playlist.updated_at)),
        track_count: Some(option.unwrap(data.1, 0)),
        tracks: Some(tracks),
      )
    }
  }
}
