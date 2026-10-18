import gleam/dict
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, and, asc, count, desc, distinct, eq, eq_columns, exists,
  field, group_by, in_array, inner_join, is_not_null, left_join,
  limit as db_limit, min, nested, nullable, offset as db_offset, or, order_by,
  pair, reference, select, where,
}
import rocksky_api/drizzle/rsql
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as p
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_playlists as up
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/schema/playlists.{type Playlist}
import rocksky_api/task
import rocksky_api/views/profile

pub fn fields(curators: Bool) {
  let playlists = p.table()
  let tracks = t.table()
  let users = u.table()
  dict.from_list(
    list.append(
      [
        #("name", rsql.Text(nullable(p.name(playlists)))),
        #("title", rsql.Text(nullable(p.name(playlists)))),
        #("description", rsql.Text(p.description(playlists))),
        #("uri", rsql.Text(p.uri(playlists))),
        #("spotifyLink", rsql.Text(p.spotify_link(playlists))),
        #("tidalLink", rsql.Text(p.tidal_link(playlists))),
        #("appleMusicLink", rsql.Text(p.apple_music_link(playlists))),
        #("createdAt", rsql.Date(nullable(p.created_at(playlists)))),
        #("updatedAt", rsql.Date(nullable(p.updated_at(playlists)))),
        #("track.title", rsql.Text(nullable(t.title(tracks)))),
        #("track.artist", rsql.Text(nullable(t.artist(tracks)))),
        #("track.album", rsql.Text(nullable(t.album(tracks)))),
        #("track.albumArtist", rsql.Text(nullable(t.album_artist(tracks)))),
      ],
      case curators {
        False -> []
        True -> [
          #("curatorDid", rsql.Text(nullable(u.did(users)))),
          #("curatorHandle", rsql.Text(nullable(u.handle(users)))),
          #("curatorName", rsql.Text(u.display_name(users))),
        ]
      },
    ),
  )
}

pub fn selection(playlists, users) {
  pair(
    nested("playlist", all_columns(playlists)),
    nested("curator", profile.selection(users)),
  )
}

pub fn retrieve(ctx: Context, actor, filter, raw_filter, limit, offset) {
  let playlists = p.table()
  let users = u.table()
  let memberships = up.table()
  let entries = pt.table()
  let tracks = t.table()
  let base = case actor {
    None ->
      select(memberships, selection(playlists, users))
      |> left_join(
        playlists,
        eq_columns(up.playlist_id(memberships), p.id(playlists)),
      )
      |> left_join(users, eq_columns(up.user_id(memberships), u.id(users)))
    Some(_) ->
      select(playlists, selection(playlists, users))
      |> left_join(users, eq_columns(p.created_by(playlists), u.id(users)))
  }
  let conditions = case actor {
    None ->
      case filter {
        None -> []
        Some(c) -> [c]
      }
    Some(did) -> [
      or([eq(u.did(users), did), eq(u.handle(users), did)]),
      ..case filter {
        None -> []
        Some(c) -> [c]
      }
    ]
  }
  let on_tracks =
    rsql.selectors(raw_filter)
    |> list.any(fn(s) {
      list.contains(
        ["track.title", "track.artist", "track.album", "track.albumArtist"],
        s,
      )
    })
  let query = case on_tracks {
    False -> base |> where(and(conditions))
    True -> {
      let matching =
        select(entries, field("id", pt.id(entries)))
        |> inner_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
        |> where(
          and([
            eq_columns(pt.playlist_id(entries), p.id(playlists)),
            ..conditions
          ]),
        )
      let query = base |> where(exists(matching))
      case actor {
        None -> distinct(query)
        Some(_) -> query
      }
    }
  }
  let query = case actor {
    None -> query |> order_by([desc(p.created_at(playlists))])
    Some(_) -> query
  }
  let query = case limit {
    None -> query
    Some(n) -> db_limit(query, n)
  }
  let query = case offset {
    None -> query
    Some(n) -> db_offset(query, n)
  }
  use rows <- task.then(all(query, ctx.db))
  use summaries <- task.map(summaries(ctx, list.map(rows, fn(r) { r.0.id })))
  list.map(rows, fn(r) {
    let summary = dict.get(summaries, r.0.id) |> result.unwrap(#(0, []))
    basic(r.0, r.1, summary.0, summary.1)
  })
}

pub fn summaries(ctx: Context, ids: List(String)) {
  case ids {
    [] -> task.ok(dict.new())
    _ -> {
      let entries = pt.table()
      let tracks = t.table()
      use data <- task.map(task.all2(
        select(
          entries,
          pair(field("id", pt.playlist_id(entries)), field("count", count())),
        )
          |> where(in_array(pt.playlist_id(entries), ids))
          |> group_by([reference(pt.playlist_id(entries))])
          |> all(ctx.db),
        select(
          entries,
          pair(
            field("id", pt.playlist_id(entries)),
            field("art", t.album_art(tracks)),
          ),
        )
          |> inner_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
          |> where(
            and([
              in_array(pt.playlist_id(entries), ids),
              is_not_null(t.album_art(tracks)),
            ]),
          )
          |> group_by([
            reference(pt.playlist_id(entries)),
            reference(t.album_art(tracks)),
          ])
          |> order_by([asc(min(pt.created_at(entries)))])
          |> all(ctx.db),
      ))
      let counts = dict.from_list(data.0)
      dict.from_list(
        list.map(ids, fn(id) {
          let arts =
            data.1
            |> list.filter(fn(r) { r.0 == id })
            |> list.filter_map(fn(r) { option.to_result(r.1, Nil) })
            |> list.take(4)
          #(id, #(dict.get(counts, id) |> result.unwrap(0), arts))
        }),
      )
    }
  }
}

pub fn basic(
  playlist: Playlist,
  curator: models.ActorProfileViewBasic,
  count: Int,
  arts: List(String),
) {
  models.PlaylistViewBasic(
    ..models.new_playlist_view_basic(),
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
    track_count: Some(count),
    track_arts: Some(arts),
  )
}
