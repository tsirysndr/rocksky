import gleam/json
import gleam/list
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, asc, count, desc, eq, eq_columns, field, from, integer,
  left_join, limit, nested, nullable, offset, one, or, order_by, pair, required,
  scalar, select, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artist_tracks as art
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as pl
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_albums as ua
import rocksky_api/drizzle/schema/user_artists as ur
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as us
import rocksky_api/lib/track_likes
import rocksky_api/schema/albums
import rocksky_api/schema/artists
import rocksky_api/schema/loved_tracks
import rocksky_api/schema/playlists
import rocksky_api/schema/tracks
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/users/json_object

pub fn likes(ctx: Context, actor: String, size: Int, skip: Int) {
  let l = lt.table()
  let t = tr.table()
  let u = us.table()
  select(
    l,
    pair(
      nested("likes", all_columns(l)),
      pair(nested("track", all_columns(t)), nested("user", all_columns(u))),
    ),
  )
  |> left_join(t, eq_columns(lt.track_id(l), tr.id(t)))
  |> left_join(u, eq_columns(lt.user_id(l), us.id(u)))
  |> where(or([eq(us.did(u), actor), eq(us.handle(u), actor)]))
  |> order_by([desc(lt.created_at(l))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    json.array(rows, fn(r) {
      json.object([
        #("loved_tracks", loved_tracks.to_json(r.0)),
        #("tracks", tracks.to_json(r.1.0)),
        #("users", users.to_json(r.1.1)),
      ])
    })
  })
}

fn count_rows(ctx: Context, table, condition) {
  select(table, field("count", count()))
  |> where(condition)
  |> required(ctx.db, "Count unavailable")
}

fn counts(base, listeners: Int, plays: Int) {
  json_object.extend(base, [
    #(
      "listeners",
      json.int(case listeners {
        0 -> 1
        _ -> listeners
      }),
    ),
    #(
      "scrobbles",
      json.int(case plays {
        0 -> 1
        _ -> plays
      }),
    ),
    #("tags", json.array([], json.string)),
  ])
}

pub fn song(ctx: Context, uri: String) {
  let t = tr.table()
  let u = ut.table()
  let s = sc.table()
  use found <- task.then(task.all2(
    from(t) |> where(eq(tr.uri(t), Some(uri))) |> one(ctx.db),
    select(u, nested("track", all_columns(t)))
      |> left_join(t, eq_columns(ut.track_id(u), tr.id(t)))
      |> where(eq(ut.uri(u), Some(uri)))
      |> one(ctx.db),
  ))
  use track <- task.then(
    option.or(found.0, found.1)
    |> task.require("Track not found")
    |> task.from_result,
  )
  use totals <- task.map(task.all2(
    count_rows(ctx, u, eq(ut.track_id(u), track.id)),
    count_rows(ctx, s, eq(sc.track_id(s), Some(track.id))),
  ))
  counts(tracks.to_json(track), totals.0, totals.1)
}

pub fn artist(ctx: Context, uri: String) {
  let a = ar.table()
  let u = ur.table()
  let s = sc.table()
  use artist <- task.then(
    select(u, nested("artist", all_columns(a)))
    |> left_join(a, eq_columns(ur.artist_id(u), ar.id(a)))
    |> where(or([eq(ur.uri(u), Some(uri)), eq(ar.uri(a), Some(uri))]))
    |> required(ctx.db, "Artist not found"),
  )
  use totals <- task.map(task.all2(
    count_rows(ctx, u, eq(ur.artist_id(u), artist.id)),
    count_rows(ctx, s, eq(sc.artist_id(s), Some(artist.id))),
  ))
  counts(artists.to_json(artist), totals.0, totals.1)
}

pub fn album(ctx: Context, uri: String) {
  let a = al.table()
  let u = ua.table()
  let s = sc.table()
  let link = at.table()
  let t = tr.table()
  use album <- task.then(
    select(u, nested("album", all_columns(a)))
    |> left_join(a, eq_columns(ua.album_id(u), al.id(a)))
    |> where(or([eq(ua.uri(u), Some(uri)), eq(al.uri(a), Some(uri))]))
    |> required(ctx.db, "Album not found"),
  )
  use rows <- task.then(
    select(link, nested("track", all_columns(t)))
    |> left_join(t, eq_columns(at.track_id(link), tr.id(t)))
    |> where(eq(at.album_id(link), album.id))
    |> order_by([asc(tr.track_number(t))])
    |> all(ctx.db),
  )
  use totals <- task.map(task.all2(
    count_rows(ctx, u, eq(ua.album_id(u), album.id)),
    count_rows(ctx, s, eq(sc.album_id(s), Some(album.id))),
  ))
  let label =
    list.first(rows)
    |> option.from_result
    |> option.then(fn(t) { t.label })
    |> option.unwrap("")
  // Legacy REST accessed snake_case fields on camelCase rows, so all positions
  // shared one key. Preserve that response while XRPC uses the corrected dedupe.
  let rows = case rows {
    [] -> []
    [first, ..rest] -> [
      list.fold(rest, first, fn(old, t) {
        case
          option.unwrap(old.lyrics, "") == ""
          && option.unwrap(t.lyrics, "") != ""
        {
          True -> t
          False -> old
        }
      }),
    ]
  }
  counts(albums.to_json(album), totals.0, totals.1)
  |> json_object.extend([
    #("label", json.string(label)),
    #("tracks", json.array(rows, tracks.to_json)),
  ])
}

pub fn scrobble(ctx: Context, uri: String) {
  let s = sc.table()
  let t = tr.table()
  let u = us.table()
  let ut = ut.table()
  use record <- task.then(
    select(
      s,
      pair(
        field("id", sc.id(s)),
        pair(nested("track", all_columns(t)), nested("user", all_columns(u))),
      ),
    )
    |> left_join(t, eq_columns(sc.track_id(s), nullable(tr.id(t))))
    |> left_join(u, eq_columns(sc.user_id(s), nullable(us.id(u))))
    |> where(eq(sc.uri(s), Some(uri)))
    |> required(ctx.db, "Scrobble not found"),
  )
  use totals <- task.map(task.all2(
    count_rows(ctx, ut, eq(ut.track_id(ut), record.1.0.id)),
    count_rows(ctx, s, eq(sc.track_id(s), Some(record.1.0.id))),
  ))
  counts(
    json.object([
      #("id", json.string(record.0)),
      #("tracks", tracks.to_json(record.1.0)),
      #("users", users.to_json(record.1.1)),
    ]),
    totals.0,
    totals.1,
  )
}

pub fn artist_tracks(ctx: Context, uri: String, size: Int, skip: Int) {
  let a = art.table()
  let t = tr.table()
  select(
    a,
    pair(field("version", art.xata_version(a)), nested("track", all_columns(t))),
  )
  |> left_join(t, eq_columns(art.track_id(a), tr.id(t)))
  |> where(eq(art.artist_id(a), uri))
  |> order_by([desc(art.xata_version(a))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    json.array(rows, fn(r) {
      json_object.extend(tracks.to_json(r.1), [
        #("xata_version", json.nullable(r.0, json.int)),
      ])
    })
  })
}

pub fn artist_albums(ctx: Context, uri: String, size: Int, skip: Int) {
  let a = aa.table()
  let album = al.table()
  select(
    a,
    pair(
      field("version", aa.xata_version(a)),
      nested("album", all_columns(album)),
    ),
  )
  |> left_join(album, eq_columns(aa.album_id(a), al.id(album)))
  |> where(eq(aa.artist_id(a), uri))
  |> order_by([desc(aa.xata_version(a))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    unique_by(rows, fn(r) { r.1.id })
    |> json.array(fn(r) {
      json_object.extend(albums.to_json(r.1), [
        #("xata_version", json.nullable(r.0, json.int)),
      ])
    })
  })
}

pub fn playlists(ctx: Context, actor: String, size: Int, skip: Int) {
  let p = pl.table()
  let u = us.table()
  let pt = pt.table()
  let count =
    select(pt, field("count", count()))
    |> where(eq_columns(pt.playlist_id(pt), pl.id(p)))
  select(
    p,
    pair(
      nested("playlist", all_columns(p)),
      field("count", scalar(count, integer())),
    ),
  )
  |> left_join(u, eq_columns(pl.created_by(p), us.id(u)))
  |> where(or([eq(us.did(u), actor), eq(us.handle(u), actor)]))
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
  |> task.map(fn(rows) {
    json.array(rows, fn(r) {
      json_object.extend(playlists.to_json(r.0), [
        #("trackCount", json.int(r.1)),
      ])
    })
  })
}

pub fn playlist(ctx: Context, uri: String, did) {
  let p = pl.table()
  let u = us.table()
  let pt = pt.table()
  let t = tr.table()
  use playlist <- task.then(
    select(
      p,
      pair(nested("playlist", all_columns(p)), nested("user", all_columns(u))),
    )
    |> left_join(u, eq_columns(pl.created_by(p), us.id(u)))
    |> where(eq(pl.uri(p), Some(uri)))
    |> required(ctx.db, "Playlist not found"),
  )
  use tracks <- task.then(
    select(pt, nested("track", all_columns(t)))
    |> left_join(p, eq_columns(pt.playlist_id(pt), pl.id(p)))
    |> left_join(t, eq_columns(pt.track_id(pt), tr.id(t)))
    |> where(eq(pl.uri(p), Some(uri)))
    |> order_by([asc(pt.created_at(pt))])
    |> all(ctx.db),
  )
  use likes <- task.map(track_likes.for_track_ids(
    ctx,
    list.map(tracks, fn(t) { t.id }),
    did,
  ))
  json_object.extend(playlists.to_json(playlist.0), [
    #("curatedBy", users.to_json(playlist.1)),
    #(
      "tracks",
      json.array(tracks, fn(t) {
        let liked = track_likes.get(likes, t.id)
        json_object.extend(tracks.to_json(t), [
          #("likesCount", json.int(liked.likes_count)),
          #("liked", json.bool(liked.liked)),
        ])
      }),
    ),
  ])
}

fn unique_by(rows: List(a), key: fn(a) -> b) {
  let #(_, rows) =
    list.fold(rows, #([], []), fn(acc, row) {
      let k = key(row)
      case list.contains(acc.0, k) {
        True -> acc
        False -> #([k, ..acc.0], [row, ..acc.1])
      }
    })
  list.reverse(rows)
}
