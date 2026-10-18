import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  type Expression, all, all_columns, and, delete, desc, eq, eq_columns, from,
  inner_join, insert, limit, offset, on_conflict_do_nothing, one, order_by,
  required, returning_one, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/album_tracks as at
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artist_tracks as art
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/loved_tracks as lt
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/lexicon/validation
import rocksky_api/lib/helpers
import rocksky_api/lib/nats_rows
import rocksky_api/lib/track.{type Track}
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/node/tid
import rocksky_api/notifications/service as notifications
import rocksky_api/playlists/service as playlists
import rocksky_api/task
import rocksky_api/tracks/service as tracks

fn optional(column: Expression(Option(a)), value: Option(a)) {
  case value {
    None -> []
    Some(_) -> [set(column, value)]
  }
}

pub fn like_track(
  ctx: Context,
  track: Track,
  user: String,
  agent: agent.Agent,
) {
  let table = t.table()
  use existing <- task.then(tracks.lookup(ctx, track))
  let values = [
    set(t.title(table), track.title),
    set(t.artist(table), track.artist),
    set(t.album(table), track.album),
    set(
      t.album_art(table),
      Some(helpers.with_fallback_album_art(track.album_art)),
    ),
    set(t.album_artist(table), track.album_artist),
    set(t.duration(table), track.duration),
    set(t.sha256(table), crypto.sha256_hex(track.identity(track))),
    ..list.flatten([
      optional(t.track_number(table), track.track_number),
      optional(t.mb_id(table), track.mb_id),
      optional(t.composer(table), track.composer),
      optional(t.lyrics(table), track.lyrics),
      optional(t.disc_number(table), track.disc_number),
    ])
  ]
  use song <- task.then(
    case existing {
      Some(song) -> update(table, values, eq(t.id(table), song.id))
      None -> insert(table, values)
    }
    |> returning_one(ctx.db, "Track not saved"),
  )
  let artists = ar.table()
  use existing <- task.then(tracks.artist_lookup(ctx, track))
  let values = [
    set(ar.name(artists), track.album_artist),
    set(ar.sha256(artists), crypto.sha256_hex(track.artist_identity(track))),
  ]
  use artist <- task.then(
    case existing {
      Some(artist) -> update(artists, values, eq(ar.id(artists), artist.id))
      None -> insert(artists, values)
    }
    |> returning_one(ctx.db, "Artist not saved"),
  )
  let albums = al.table()
  use existing <- task.then(tracks.album_lookup(ctx, track))
  let values = [
    set(al.title(albums), track.album),
    set(al.artist(albums), track.album_artist),
    set(
      al.album_art(albums),
      Some(helpers.with_fallback_album_art(track.album_art)),
    ),
    set(al.sha256(albums), crypto.sha256_hex(track.album_identity(track))),
    ..list.append(
      optional(al.year(albums), track.year),
      optional(
        al.release_date(albums),
        option.map(track.release_date, fn(d) { d <> "T00:00:00.000Z" }),
      ),
    )
  ]
  use album <- task.then(
    case existing {
      Some(album) -> update(albums, values, eq(al.id(albums), album.id))
      None -> insert(albums, values)
    }
    |> returning_one(ctx.db, "Album not saved"),
  )
  let album_tracks = at.table()
  let artist_tracks = art.table()
  let artist_albums = aa.table()
  use links <- task.then(task.all3(
    from(album_tracks)
      |> where(
        and([
          eq(at.album_id(album_tracks), album.id),
          eq(at.track_id(album_tracks), song.id),
        ]),
      )
      |> one(ctx.db),
    from(artist_tracks)
      |> where(
        and([
          eq(art.artist_id(artist_tracks), artist.id),
          eq(art.track_id(artist_tracks), song.id),
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
        set(at.track_id(album_tracks), song.id),
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
        set(art.track_id(artist_tracks), song.id),
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
  use song <- task.then(
    from(table)
    |> where(eq(t.id(table), song.id))
    |> required(ctx.db, "Track not found"),
  )
  case song.uri {
    None | Some("") -> task.ok(None)
    Some(uri) -> {
      use ref <- task.then(playlists.record_ref(ctx, uri, "app.rocksky.song"))
      let record =
        json.object([
          #("$type", json.string("app.rocksky.like")),
          #("subject", models.encode_strong_ref(ref)),
          #(
            "createdAt",
            json.string(row.iso8601(row.from_unix_ms(js.now_ms()))),
          ),
        ])
      use _ <- task.then(
        task.from_result(validation.record("app.rocksky.like", record)),
      )
      use did <- task.then(
        task.from_result(task.require(agent.did(agent), "Missing agent DID")),
      )
      use created <- task.then(
        task.attempt_result(agent.create_record_unchecked(
          agent,
          did,
          "app.rocksky.like",
          tid.next(),
          record,
        )),
      )
      use owner_did <- task.then(task.from_result(playlists.at_uri_repo(uri)))
      let users = u.table()
      use owner <- task.then(
        from(users) |> where(eq(u.did(users), owner_did)) |> one(ctx.db),
      )
      use _ <- task.map(notifications.create(
        ctx,
        option.map(owner, fn(u) { u.id }),
        Some(user),
        "like_scrobble",
        None,
        Some(uri),
      ))
      Some(created.uri)
    }
  }
}

pub fn unlike_track(
  ctx: Context,
  hash: String,
  user: String,
  agent: agent.Agent,
) {
  let tracks = t.table()
  use track <- task.then(
    from(tracks) |> where(eq(t.sha256(tracks), hash)) |> one(ctx.db),
  )
  case track {
    None -> task.ok(Nil)
    Some(track) -> {
      let likes = lt.table()
      use liked <- task.then(
        from(likes)
        |> where(
          and([eq(lt.track_id(likes), track.id), eq(lt.user_id(likes), user)]),
        )
        |> one(ctx.db),
      )
      case liked {
        None -> task.ok(Nil)
        Some(like) -> {
          let rkey = like.uri |> option.map(agent.rkey_of) |> option.unwrap("")
          case rkey {
            "" -> {
              use _ <- task.map(
                delete(likes, eq(lt.id(likes), like.id)) |> run(ctx.db),
              )
              nats.publish(
                ctx.nc,
                "rocksky.unlike",
                json.object([
                  #("uri", json.nullable(like.uri, json.string)),
                  #("user_id", nats_rows.reference(user)),
                  #("track_id", nats_rows.reference(track.id)),
                  #("xata_createdat", json.string(row.iso8601(like.created_at))),
                  #("xata_id", json.string(like.id)),
                  #("xata_updatedat", json.string(row.iso8601(like.created_at))),
                  #("xata_version", json.int(0)),
                ])
                  |> json.to_string,
              )
            }
            _ -> {
              use did <- task.then(
                task.from_result(task.require(
                  agent.did(agent),
                  "Missing agent DID",
                )),
              )
              task.attempt_result(agent.delete_record(
                agent,
                did,
                "app.rocksky.like",
                rkey,
              ))
            }
          }
        }
      }
    }
  }
}

pub fn get_loved_tracks(ctx: Context, user: String, size: Int, skip: Int) {
  let likes = lt.table()
  let tracks = t.table()
  select(likes, all_columns(tracks))
  |> inner_join(tracks, eq_columns(lt.track_id(likes), t.id(tracks)))
  |> where(eq(lt.user_id(likes), user))
  |> order_by([desc(lt.created_at(likes))])
  |> limit(size)
  |> offset(skip)
  |> all(ctx.db)
}
