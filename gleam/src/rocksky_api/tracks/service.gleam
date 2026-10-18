import gleam/javascript/promise
import gleam/json
import gleam/option.{type Option, None, Some}
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  and, asc, eq, from, insert, on_conflict_do_nothing, one, order_by, run, set,
  update, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artist_tracks as art
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/lib/helpers
import rocksky_api/lib/nats_rows
import rocksky_api/lib/track.{type Track, Track}
import rocksky_api/node/crypto
import rocksky_api/node/nats
import rocksky_api/nowplaying/records
import rocksky_api/schema/album_tracks
import rocksky_api/schema/albums
import rocksky_api/schema/artist_albums
import rocksky_api/schema/artist_tracks
import rocksky_api/schema/artists
import rocksky_api/schema/tracks
import rocksky_api/task

pub fn lookup(ctx: Context, track: Track) {
  let table = t.table()
  from(table)
  |> where(eq(t.sha256(table), crypto.sha256_hex(track.identity(track))))
  |> order_by([asc(t.id(table))])
  |> one(ctx.db)
}

pub fn album_lookup(ctx: Context, track: Track) {
  let table = al.table()
  from(table)
  |> where(eq(al.sha256(table), crypto.sha256_hex(track.album_identity(track))))
  |> one(ctx.db)
}

pub fn artist_lookup(ctx: Context, track: Track) {
  let table = ar.table()
  from(table)
  |> where(eq(ar.sha256(table), crypto.sha256_hex(track.artist_identity(track))))
  |> one(ctx.db)
}

fn present(value: Option(String)) {
  case value {
    None | Some("") -> False
    _ -> True
  }
}

pub fn heal_uris(ctx: Context, existing: Option(tracks.Track), track: Track) {
  case existing {
    None -> task.ok(Nil)
    Some(song) -> {
      let table = t.table()
      use _ <- task.then(case present(song.album_uri) {
        True -> task.ok(Nil)
        False -> {
          use album <- task.then(album_lookup(ctx, track))
          case album {
            None -> task.ok(Nil)
            Some(a) ->
              update(
                table,
                [set(t.album_uri(table), a.uri)],
                eq(t.id(table), song.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
          }
        }
      })
      case present(song.artist_uri) {
        True -> task.ok(Nil)
        False -> {
          use artist <- task.then(artist_lookup(ctx, track))
          case artist {
            None -> task.ok(Nil)
            Some(a) ->
              update(
                table,
                [set(t.artist_uri(table), a.uri)],
                eq(t.id(table), song.id),
              )
              |> run(ctx.db)
              |> task.map(fn(_) { Nil })
          }
        }
      }
    }
  }
}

pub fn save_track(ctx: Context, track: Track, agent: agent.Agent) {
  use existing <- task.then(lookup(ctx, track))
  let track = case present(track.album_art) {
    True -> track
    False ->
      Track(..track, album_art: option.then(existing, fn(t) { t.album_art }))
  }
  use track_uri <- task.then(case option.then(existing, fn(t) { t.uri }) {
    Some(uri) if uri != "" -> task.ok(Some(uri))
    _ -> records.put_song_record(track, agent)
  })
  use _ <- task.then(heal_uris(ctx, existing, track))
  use artist <- task.then(artist_lookup(ctx, track))
  use artist_uri <- task.then(case option.then(artist, fn(a) { a.uri }) {
    Some(uri) if uri != "" -> task.ok(Some(uri))
    _ -> records.put_artist_record(track, agent)
  })
  use album <- task.then(album_lookup(ctx, track))
  let track = case present(track.album_art) {
    True -> track
    False ->
      Track(..track, album_art: option.then(album, fn(a) { a.album_art }))
  }
  use album_uri <- task.then(case option.then(album, fn(a) { a.uri }) {
    Some(uri) if uri != "" -> task.ok(Some(uri))
    _ -> records.put_album_record(track, agent)
  })
  poll(ctx, track_uri, album_uri, artist_uri, 0)
}

fn poll(
  ctx: Context,
  track_uri: Option(String),
  album_uri: Option(String),
  artist_uri: Option(String),
  tries: Int,
) {
  case tries >= 15 {
    True -> task.ok(Nil)
    False -> {
      let tracks = t.table()
      let albums = al.table()
      let artists = ar.table()
      use rows <- task.then(task.all3(
        from(tracks) |> where(eq(t.uri(tracks), track_uri)) |> one(ctx.db),
        from(albums) |> where(eq(al.uri(albums), album_uri)) |> one(ctx.db),
        from(artists) |> where(eq(ar.uri(artists), artist_uri)) |> one(ctx.db),
      ))
      use done <- task.then(case rows {
        #(Some(track), Some(album), Some(artist)) -> {
          case
            helpers.credits_artist(
              Some(artist.name),
              Some(track.artist),
              Some(track.album_artist),
            )
          {
            False -> task.ok(True)
            True -> link(ctx, track, album, artist)
          }
        }
        _ -> task.ok(False)
      })
      case done {
        True -> task.ok(Nil)
        False -> {
          use _ <- promise.await(task.sleep(1000))
          poll(ctx, track_uri, album_uri, artist_uri, tries + 1)
        }
      }
    }
  }
}

pub fn publish_track(
  ctx: Context,
  track: tracks.Track,
  album_track: album_tracks.AlbumTrack,
  artist_track: artist_tracks.ArtistTrack,
  artist_album: artist_albums.ArtistAlbum,
) {
  let message =
    json.object([
      #("track", nats_rows.encode(tracks.to_json(track), [])),
      #(
        "album_track",
        nats_rows.encode(album_tracks.to_json(album_track), [
          #("albumId", nats_rows.reference(album_track.album_id)),
          #("trackId", nats_rows.reference(album_track.track_id)),
        ]),
      ),
      #(
        "artist_track",
        nats_rows.encode(artist_tracks.to_json(artist_track), [
          #("artistId", nats_rows.reference(artist_track.artist_id)),
          #("trackId", nats_rows.reference(artist_track.track_id)),
        ]),
      ),
      #(
        "artist_album",
        nats_rows.encode(artist_albums.to_json(artist_album), [
          #("artistId", nats_rows.reference(artist_album.artist_id)),
          #("albumId", nats_rows.reference(artist_album.album_id)),
        ]),
      ),
    ])
  nats.publish(ctx.nc, "rocksky.track", nats_rows.stringify(message))
}

fn link(
  ctx: Context,
  track: tracks.Track,
  album: albums.Album,
  artist: artists.Artist,
) {
  let album_tracks = at.table()
  let artist_tracks = art.table()
  let artist_albums = aa.table()
  use links <- task.then(task.all3(
    from(album_tracks)
      |> where(
        and([
          eq(at.album_id(album_tracks), album.id),
          eq(at.track_id(album_tracks), track.id),
        ]),
      )
      |> one(ctx.db),
    from(artist_tracks)
      |> where(
        and([
          eq(art.artist_id(artist_tracks), artist.id),
          eq(art.track_id(artist_tracks), track.id),
        ]),
      )
      |> one(ctx.db),
    from(artist_albums)
      |> where(
        and([
          eq(aa.artist_id(artist_albums), artist.id),
          eq(aa.album_id(artist_albums), album.id),
        ]),
      )
      |> one(ctx.db),
  ))
  use _ <- task.then(case links.0 {
    Some(_) -> task.ok(Nil)
    None ->
      insert(album_tracks, [
        set(at.album_id(album_tracks), album.id),
        set(at.track_id(album_tracks), track.id),
      ])
      |> on_conflict_do_nothing
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
  })
  use _ <- task.then(case links.1 {
    Some(_) -> task.ok(Nil)
    None ->
      insert(artist_tracks, [
        set(art.artist_id(artist_tracks), artist.id),
        set(art.track_id(artist_tracks), track.id),
      ])
      |> on_conflict_do_nothing
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
  })
  use _ <- task.then(case links.2 {
    Some(_) -> task.ok(Nil)
    None ->
      insert(artist_albums, [
        set(aa.artist_id(artist_albums), artist.id),
        set(aa.album_id(artist_albums), album.id),
      ])
      |> on_conflict_do_nothing
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
  })
  let tracks = t.table()
  use _ <- task.then(case present(track.album_uri) {
    True -> task.ok(Nil)
    False ->
      update(
        tracks,
        [set(t.album_uri(tracks), album.uri)],
        eq(t.id(tracks), track.id),
      )
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
  })
  use _ <- task.map(case present(track.artist_uri) {
    True -> task.ok(Nil)
    False ->
      update(
        tracks,
        [set(t.artist_uri(tracks), artist.uri)],
        eq(t.id(tracks), track.id),
      )
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
  })
  case links, present(track.album_uri) && present(track.artist_uri) {
    #(Some(album_track), Some(artist_track), Some(artist_album)), True -> {
      publish_track(ctx, track, album_track, artist_track, artist_album)
      True
    }
    _, _ -> False
  }
}
