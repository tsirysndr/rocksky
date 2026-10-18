import gleam/javascript/promise
import gleam/json
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all_columns, and, eq, eq_columns, from, inner_join, insert, map, nested,
  nullable, one, pair, required, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artist_tracks as art
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_albums as ua
import rocksky_api/drizzle/schema/user_artists as ur
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lib/feed_cache
import rocksky_api/lib/nats_rows
import rocksky_api/lib/stats_cache
import rocksky_api/node/nats
import rocksky_api/schema/album_tracks
import rocksky_api/schema/albums
import rocksky_api/schema/artist_albums
import rocksky_api/schema/artist_tracks
import rocksky_api/schema/artists
import rocksky_api/schema/scrobbles
import rocksky_api/schema/tracks
import rocksky_api/schema/user_albums
import rocksky_api/schema/user_artists
import rocksky_api/schema/user_tracks
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/tracks/service

pub type Joined {
  Joined(
    scrobble: scrobbles.Scrobble,
    track: tracks.Track,
    album: albums.Album,
    artist: artists.Artist,
    user: users.User,
  )
}

pub fn query() {
  let scrobbles = sc.table()
  let tracks = t.table()
  let albums = al.table()
  let artists = ar.table()
  let users = u.table()
  select(
    scrobbles,
    pair(
      pair(
        nested("scrobble", all_columns(scrobbles)),
        nested("track", all_columns(tracks)),
      ),
      pair(
        nested("album", all_columns(albums)),
        pair(
          nested("artist", all_columns(artists)),
          nested("user", all_columns(users)),
        ),
      ),
    )
      |> map(fn(v) { Joined(v.0.0, v.0.1, v.1.0, v.1.1.0, v.1.1.1) }),
  )
  |> inner_join(
    tracks,
    eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
  )
  |> inner_join(
    albums,
    eq_columns(sc.album_id(scrobbles), nullable(al.id(albums))),
  )
  |> inner_join(
    artists,
    eq_columns(sc.artist_id(scrobbles), nullable(ar.id(artists))),
  )
  |> inner_join(users, eq_columns(sc.user_id(scrobbles), nullable(u.id(users))))
}

pub fn publish_scrobble(ctx: Context, id: String) {
  let scrobbles = sc.table()
  use item <- task.then(
    query()
    |> where(eq(sc.id(scrobbles), id))
    |> required(ctx.db, "Scrobble not found"),
  )
  let user_albums = ua.table()
  let user_artists = ur.table()
  let user_tracks = ut.table()
  let album_tracks = at.table()
  let artist_tracks = art.table()
  let artist_albums = aa.table()
  // Preserve the source's entity-only membership lookups for legacy NATS payloads.
  use memberships <- task.then(task.all3(
    from(user_albums)
      |> where(eq(ua.album_id(user_albums), item.album.id))
      |> one(ctx.db),
    from(user_artists)
      |> where(eq(ur.artist_id(user_artists), item.artist.id))
      |> one(ctx.db),
    from(user_tracks)
      |> where(eq(ut.track_id(user_tracks), item.track.id))
      |> one(ctx.db),
  ))
  use links <- task.then(task.all3(
    from(album_tracks)
      |> where(eq(at.track_id(album_tracks), item.track.id))
      |> required(ctx.db, "Album track missing"),
    from(artist_tracks)
      |> where(eq(art.track_id(artist_tracks), item.track.id))
      |> required(ctx.db, "Artist track missing"),
    from(artist_albums)
      |> where(
        and([
          eq(aa.album_id(artist_albums), item.album.id),
          eq(aa.artist_id(artist_albums), item.artist.id),
        ]),
      )
      |> required(ctx.db, "Artist album missing"),
  ))
  use user_artist <- task.then(case memberships.1 {
    Some(v) -> task.ok(v)
    None -> {
      use uri <- task.then(
        task.require(item.artist.uri, "Missing artist URI") |> task.from_result,
      )
      use _ <- task.then(
        insert(user_artists, [
          set(ur.user_id(user_artists), item.user.id),
          set(ur.artist_id(user_artists), item.artist.id),
          set(ur.uri(user_artists), uri),
          set(ur.scrobbles(user_artists), Some(1)),
        ])
        |> run(ctx.db),
      )
      from(user_artists)
      |> where(eq(ur.artist_id(user_artists), item.artist.id))
      |> required(ctx.db, "User artist missing")
    }
  })
  use user_album <- task.then(case memberships.0 {
    Some(v) -> task.ok(v)
    None -> {
      use uri <- task.then(
        task.require(item.album.uri, "Missing album URI") |> task.from_result,
      )
      use _ <- task.then(
        insert(user_albums, [
          set(ua.user_id(user_albums), item.user.id),
          set(ua.album_id(user_albums), item.album.id),
          set(ua.uri(user_albums), uri),
          set(ua.scrobbles(user_albums), Some(1)),
        ])
        |> run(ctx.db),
      )
      from(user_albums)
      |> where(eq(ua.album_id(user_albums), item.album.id))
      |> required(ctx.db, "User album missing")
    }
  })
  use user_track <- task.then(case memberships.2 {
    Some(v) -> task.ok(v)
    None -> {
      use uri <- task.then(
        task.require(item.track.uri, "Missing track URI") |> task.from_result,
      )
      use _ <- task.then(
        insert(user_tracks, [
          set(ut.user_id(user_tracks), item.user.id),
          set(ut.track_id(user_tracks), item.track.id),
          set(ut.uri(user_tracks), uri),
          set(ut.scrobbles(user_tracks), Some(1)),
        ])
        |> run(ctx.db),
      )
      from(user_tracks)
      |> where(eq(ut.track_id(user_tracks), item.track.id))
      |> required(ctx.db, "User track missing")
    }
  })
  let message =
    json.object([
      #(
        "scrobble",
        nats_rows.encode(scrobbles.to_json(item.scrobble), [
          #("albumId", nats_rows.encode(albums.to_json(item.album), [])),
          #("artistId", nats_rows.encode(artists.to_json(item.artist), [])),
          #("trackId", nats_rows.encode(tracks.to_json(item.track), [])),
          #("userId", nats_rows.encode(users.to_json(item.user), [])),
          #("timestamp", json.string(row.iso8601(item.scrobble.timestamp))),
        ]),
      ),
      #(
        "user_album",
        nats_rows.encode(user_albums.to_json(user_album), [
          #("albumId", nats_rows.reference(item.album.id)),
          #("userId", nats_rows.reference(item.user.id)),
        ]),
      ),
      #(
        "user_artist",
        nats_rows.encode(user_artists.to_json(user_artist), [
          #("artistId", nats_rows.reference(item.artist.id)),
          #("userId", nats_rows.reference(item.user.id)),
        ]),
      ),
      #(
        "user_track",
        nats_rows.encode(user_tracks.to_json(user_track), [
          #("trackId", nats_rows.reference(item.track.id)),
          #("userId", nats_rows.reference(item.user.id)),
        ]),
      ),
      #(
        "album_track",
        nats_rows.encode(album_tracks.to_json(links.0), [
          #("albumId", nats_rows.reference(item.album.id)),
          #("trackId", nats_rows.reference(item.track.id)),
        ]),
      ),
      #(
        "artist_track",
        nats_rows.encode(artist_tracks.to_json(links.1), [
          #("artistId", nats_rows.reference(item.artist.id)),
          #("trackId", nats_rows.reference(item.track.id)),
        ]),
      ),
      #(
        "artist_album",
        nats_rows.encode(artist_albums.to_json(links.2), [
          #("artistId", nats_rows.reference(item.artist.id)),
          #("albumId", nats_rows.reference(item.album.id)),
        ]),
      ),
    ])
  nats.publish(ctx.nc, "rocksky.scrobble", nats_rows.stringify(message))
  task.background(feed_cache.bump_all_feed_versions(ctx), fn(_) { Nil })
  task.background(feed_cache.bump_scrobbles_version(ctx), fn(_) { Nil })
  task.background(
    stats_cache.invalidate(ctx, [Some(item.user.did), Some(item.user.handle)]),
    fn(_) { Nil },
  )
  service.publish_track(ctx, item.track, links.0, links.1, links.2)
  task.ok(Nil)
}

pub fn hydrate(ctx: Context, uri: String, did: String) {
  use _ <- task.map(poll(ctx, uri, 0))
  nats.publish(ctx.nc, "rocksky.user.scrobble.sync", did)
}

fn poll(ctx: Context, uri: String, tries: Int) {
  case tries >= 30 {
    True -> task.ok(Nil)
    False -> {
      let scrobbles = sc.table()
      let albums = al.table()
      use item <- task.then(
        query() |> where(eq(sc.uri(scrobbles), Some(uri))) |> one(ctx.db),
      )
      use _ <- task.then(case item {
        Some(item) ->
          case item.album.artist_uri, item.artist.uri {
            None, Some(uri) | Some(""), Some(uri) if uri != "" ->
              update(
                albums,
                [set(al.artist_uri(albums), Some(uri))],
                eq(al.id(albums), item.album.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
            _, _ -> task.ok(Nil)
          }
        None -> task.ok(Nil)
      })
      use item <- task.then(
        query() |> where(eq(sc.uri(scrobbles), Some(uri))) |> one(ctx.db),
      )
      let ready = case item {
        Some(item) ->
          option.unwrap(item.album.artist_uri, "") != ""
          && option.unwrap(item.track.artist_uri, "") != ""
          && option.unwrap(item.track.album_uri, "") != ""
        None -> False
      }
      case item, ready {
        Some(item), True -> publish_scrobble(ctx, item.scrobble.id)
        _, _ -> {
          use _ <- promise.await(task.sleep(1000))
          poll(ctx, uri, tries + 1)
        }
      }
    }
  }
}
