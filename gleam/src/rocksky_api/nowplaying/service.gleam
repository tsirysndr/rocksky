import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  and, eq, eq_columns, field, gte, inner_join, is_null, lower, lte, nullable,
  one, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/user_albums as ua
import rocksky_api/drizzle/schema/user_artists as ur
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lib/durable_record
import rocksky_api/lib/matching
import rocksky_api/lib/record_ownership
import rocksky_api/lib/scrobble_dedup
import rocksky_api/lib/scrobble_guard
import rocksky_api/lib/track.{type Track, Track}
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/node/map as mutable_map
import rocksky_api/nowplaying/enrichment
import rocksky_api/nowplaying/publish
import rocksky_api/nowplaying/records
import rocksky_api/schema/tracks as track_rows
import rocksky_api/task.{type Task}
import rocksky_api/tealfm/index as tealfm
import rocksky_api/tealfm/publication
import rocksky_api/tracks/service as tracks

pub type Submission {
  Submission(id: String, rkey: String, skip_teal: Bool)
}

pub type ImportCache {
  ImportCache(
    artists: mutable_map.Map(String, Task(Option(String))),
    albums: mutable_map.Map(String, Task(Option(String))),
  )
}

pub fn import_cache() {
  ImportCache(mutable_map.new(), mutable_map.new())
}

fn cached_put(
  cache: mutable_map.Map(String, Task(Option(String))),
  hash: String,
  put: fn() -> Task(Option(String)),
) {
  case mutable_map.get(cache, hash) {
    Some(task) -> task
    None -> {
      let task = put()
      mutable_map.set(cache, hash, task)
      task
    }
  }
}

pub fn find_existing_scrobble(
  ctx: Context,
  track: Track,
  did: String,
  at: Int,
  window: Int,
) {
  let scrobbles = sc.table()
  let tracks = t.table()
  let users = u.table()
  select(scrobbles, field("id", sc.id(scrobbles)))
  |> inner_join(
    tracks,
    eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
  )
  |> inner_join(users, eq_columns(sc.user_id(scrobbles), nullable(u.id(users))))
  |> where(
    and([
      eq(u.did(users), did),
      eq(lower(t.title(tracks)), string.lowercase(track.title)),
      eq(lower(t.artist(tracks)), string.lowercase(track.artist)),
      gte(sc.timestamp(scrobbles), row.from_unix_ms({ at - window } * 1000)),
      lte(sc.timestamp(scrobbles), row.from_unix_ms({ at + window } * 1000)),
    ]),
  )
  |> one(ctx.db)
}

pub fn scrobble_track(
  ctx: Context,
  track: Track,
  agent: agent.Agent,
  did: String,
  skip_dup_check: Bool,
  cache: Option(ImportCache),
  submission: Option(Submission),
) {
  use recovered <- task.then(case submission {
    None -> task.ok(None)
    Some(job) ->
      durable_record.find(fn() {
        agent.get_record(agent, did, "app.rocksky.scrobble", job.rkey)
        |> task.attempt_result
      })
  })
  case recovered {
    Some(_) -> task.ok(Nil)
    None -> {
      let at = case track.timestamp {
        Some(at) if at != 0 -> at
        _ -> js.now_ms() / 1000
      }
      let track = Track(..track, timestamp: Some(at))
      let window = case skip_dup_check {
        True -> 0
        False -> 60
      }
      use duplicate <- task.then(case skip_dup_check {
        True -> task.ok(None)
        False -> {
          use _ <- task.then(scrobble_guard.assert_allowed(ctx, did))
          find_existing_scrobble(ctx, track, did, at, window)
        }
      })
      case duplicate {
        Some(_) -> task.ok(Nil)
        None -> {
          use _ <- task.then(case skip_dup_check {
            True -> task.ok(Nil)
            False -> {
              use blocked <- task.then(scrobble_guard.record_and_guard(
                ctx,
                did,
                at,
                option.map(submission, fn(s) { s.id }),
              ))
              case blocked {
                None -> task.ok(Nil)
                Some(blocked) -> task.fail(scrobble_guard.to_error(blocked))
              }
            }
          })
          prepare(ctx, track, agent, did, at, window, cache, submission)
        }
      }
    }
  }
}

fn prepare(
  ctx: Context,
  track: Track,
  agent: agent.Agent,
  did: String,
  at: Int,
  window: Int,
  cache: Option(ImportCache),
  submission: Option(Submission),
) {
  use existing <- task.then(tracks.lookup(ctx, track))
  use _ <- task.then(tracks.heal_uris(ctx, existing, track))
  let user_tracks = ut.table()
  let table = t.table()
  let users = u.table()
  use user_track <- task.then(
    select(user_tracks, field("uri", ut.uri(user_tracks)))
    |> inner_join(table, eq_columns(ut.track_id(user_tracks), t.id(table)))
    |> inner_join(users, eq_columns(ut.user_id(user_tracks), u.id(users)))
    |> where(
      and([
        eq(t.id(table), option.unwrap(option.map(existing, fn(t) { t.id }), "")),
        eq(u.did(users), did),
      ]),
    )
    |> one(ctx.db),
  )
  let user_track = option.flatten(user_track)
  use candidate <- task.then(
    {
      use request <- task.then(
        matching.matching_request(track) |> task.from_result,
      )
      matching.match_track(ctx, request, None)
    }
    |> task.rescue(fn(_) { task.ok(None) }),
  )
  let track = case candidate {
    None -> track
    Some(c) -> enrichment.candidate(track, c)
  }
  let track = case track.duration <= 0 {
    True -> Track(..track, duration: 1)
    False -> track
  }
  let song_hash = crypto.sha256_hex(track.identity(track))
  let artist_hash = crypto.sha256_hex(track.artist_identity(track))
  let album_hash = crypto.sha256_hex(track.album_identity(track))
  use _ <- task.then(case record_ownership.owns_record(user_track, did) {
    False ->
      record_ownership.put_record_once(
        ctx.redis,
        did,
        "app.rocksky.song",
        song_hash,
        fn() { records.put_song_record(track, agent) },
      )
      |> task.map(fn(_) { Nil })
    True ->
      case existing {
        Some(song) if song.uri == None || song.uri == Some("") ->
          update(
            table,
            [set(t.uri(table), user_track)],
            and([eq(t.id(table), song.id), is_null(t.uri(table))]),
          )
          |> run(ctx.db)
          |> task.map(fn(_) { Nil })
          |> task.rescue(fn(_) { task.ok(Nil) })
        _ -> task.ok(Nil)
      }
  })
  use album <- task.then(tracks.album_lookup(ctx, track))
  use _ <- task.then(wait_track(ctx, track, existing, 0))
  let artists = ar.table()
  let user_artists = ur.table()
  use user_artist <- task.then(
    select(user_artists, field("uri", ur.uri(user_artists)))
    |> inner_join(
      artists,
      eq_columns(ur.artist_id(user_artists), ar.id(artists)),
    )
    |> inner_join(users, eq_columns(ur.user_id(user_artists), u.id(users)))
    |> where(and([eq(ar.sha256(artists), artist_hash), eq(u.did(users), did)]))
    |> one(ctx.db),
  )
  let user_artist = option.flatten(user_artist)
  use _ <- task.then(case record_ownership.owns_record(user_artist, did) {
    True -> task.ok(None)
    False ->
      case cache {
        Some(cache) ->
          cached_put(cache.artists, artist_hash, fn() {
            records.put_artist_record(track, agent)
          })
        None ->
          record_ownership.put_record_once(
            ctx.redis,
            did,
            "app.rocksky.artist",
            artist_hash,
            fn() { records.put_artist_record(track, agent) },
          )
      }
  })
  let albums = al.table()
  let user_albums = ua.table()
  use user_album <- task.then(
    select(user_albums, field("uri", ua.uri(user_albums)))
    |> inner_join(albums, eq_columns(ua.album_id(user_albums), al.id(albums)))
    |> inner_join(users, eq_columns(ua.user_id(user_albums), u.id(users)))
    |> where(and([eq(al.sha256(albums), album_hash), eq(u.did(users), did)]))
    |> one(ctx.db),
  )
  let user_album = option.flatten(user_album)
  let track =
    Track(
      ..track,
      album_art: option.or(
        enrichment.nonempty(track.album_art),
        option.then(album, fn(a) { a.album_art }),
      ),
    )
  use _ <- task.then(case record_ownership.owns_record(user_album, did) {
    True -> task.ok(None)
    False ->
      case cache {
        Some(cache) ->
          cached_put(cache.albums, album_hash, fn() {
            records.put_album_record(track, agent)
          })
        None ->
          record_ownership.put_record_once(
            ctx.redis,
            did,
            "app.rocksky.album",
            album_hash,
            fn() { records.put_album_record(track, agent) },
          )
      }
  })
  use existing <- task.then(tracks.lookup(ctx, track))
  use existing <- task.then(wait_uris(ctx, track, existing, 0))
  use _ <- task.then(
    case
      candidate,
      option.unwrap(option.map(submission, fn(s) { s.skip_teal }), False)
    {
      Some(c), False ->
        case c.identifiers.recording {
          Some(mbid) if mbid != "" ->
            tealfm.publish_playing_now(
              ctx,
              agent,
              publication.MusicbrainzTrack(
                mbid,
                option.unwrap(c.identifiers.release, ""),
                c.title,
                option.unwrap(c.musicbrainz_artists, []),
                option.unwrap(c.album, track.album),
                row.iso8601(row.from_unix_ms(at * 1000)),
              ),
              track.duration / 1000,
              option.map(submission, fn(s) { s.id }),
            )
          _ -> task.ok(Nil)
        }
      _, _ -> task.ok(Nil)
    },
  )
  let selected_id =
    option.then(candidate, fn(c) {
      case c.source {
        "catalog" -> Some(c.id)
        _ -> None
      }
    })
  let track = enrichment.catalog(track, existing, selected_id, album)
  use duplicate <- task.then(find_existing_scrobble(ctx, track, did, at, window))
  case duplicate {
    Some(_) -> task.ok(Nil)
    None -> {
      use reserved <- task.then(scrobble_dedup.reserve_scrobble(
        ctx.redis,
        did,
        track.title,
        track.artist,
        at,
        window,
        option.map(submission, fn(s) { s.id }),
      ))
      case reserved, submission {
        False, Some(_) ->
          task.fail(error.Message(
            "Another submission holds the dedup reservation; retry after it completes or expires",
          ))
        False, None -> task.ok(Nil)
        True, _ -> {
          use uri <- task.then(
            records.put_scrobble_record(
              track,
              agent,
              option.map(submission, fn(s) { s.rkey }),
            )
            |> task.require_task("Failed to publish scrobble record"),
          )
          case submission {
            Some(_) -> task.ok(Nil)
            None -> publish.hydrate(ctx, uri, did)
          }
        }
      }
    }
  }
}

fn wait_track(
  ctx: Context,
  track: Track,
  existing: Option(track_rows.Track),
  tries: Int,
) {
  case existing, tries >= 30 {
    None, False -> {
      use existing <- task.then(tracks.lookup(ctx, track))
      use _ <- promise.await(task.sleep(1000))
      wait_track(ctx, track, existing, tries + 1)
    }
    _, _ -> task.ok(existing)
  }
}

fn wait_uris(
  ctx: Context,
  track: Track,
  existing: Option(track_rows.Track),
  tries: Int,
) {
  let artist_uri =
    option.then(existing, fn(t) { t.artist_uri }) |> option.unwrap("")
  let album_uri =
    option.then(existing, fn(t) { t.album_uri }) |> option.unwrap("")
  case artist_uri == "" && album_uri == "" && tries < 30 {
    False -> task.ok(existing)
    True -> {
      use existing <- task.then(tracks.lookup(ctx, track))
      use _ <- task.then(tracks.heal_uris(ctx, existing, track))
      use _ <- task.then(case existing {
        Some(song) if song.album_uri == None || song.album_uri == Some("") -> {
          use album <- task.then(tracks.album_lookup(ctx, track))
          case album {
            Some(album)
              if album.artist_uri == None || album.artist_uri == Some("")
            -> {
              let table = al.table()
              case song.artist_uri {
                Some(uri) if uri != "" ->
                  update(
                    table,
                    [set(al.artist_uri(table), Some(uri))],
                    eq(al.id(table), album.id),
                  )
                  |> run(ctx.db)
                  |> task.map(fn(_) { Nil })
                _ -> task.ok(Nil)
              }
            }
            _ -> task.ok(Nil)
          }
        }
        _ -> task.ok(Nil)
      })
      use _ <- promise.await(task.sleep(1000))
      wait_uris(ctx, track, existing, tries + 1)
    }
  }
}
