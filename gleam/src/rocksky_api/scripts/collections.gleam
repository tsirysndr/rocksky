import gleam/dynamic/decode
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  and, conflict_target, eq, from, insert, on_conflict_do_nothing,
  on_conflict_update, one, or, required, returning, run, set, where,
}
import rocksky_api/drizzle/schema/album_tracks as alt
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artist_albums as aa
import rocksky_api/drizzle/schema/artist_tracks as at
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/user_albums as ul
import rocksky_api/drizzle/schema/user_artists as ua
import rocksky_api/drizzle/schema/user_tracks as ut
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/extract_pds
import rocksky_api/lib/helpers
import rocksky_api/log
import rocksky_api/node/crypto
import rocksky_api/node/js
import rocksky_api/nowplaying/publish
import rocksky_api/scripts/common
import rocksky_api/task

fn hash(value: String) {
  crypto.sha256_hex(string.lowercase(value))
}

fn timestamp(value: String) {
  js.parse_date_ms(value)
  |> option.map(row.from_unix_ms)
  |> task.require("Invalid record timestamp")
  |> task.from_result
}

pub fn list_records(
  agent: atp.Agent,
  did: String,
  collection: String,
  cursor,
  acc: List(atp.Record),
) {
  use page <- task.then(
    atp.list_records(agent, did, collection, 100, cursor, False)
    |> task.attempt_result,
  )
  let acc = list.append(acc, page.records)
  case page.cursor {
    None -> task.ok(acc)
    Some(cursor) -> list_records(agent, did, collection, Some(cursor), acc)
  }
}

fn insert_or_existing(ctx: Context, mutation, query) {
  use rows <- task.then(returning(mutation, ctx.db))
  case rows {
    [first, ..] -> task.ok(first)
    [] -> required(query, ctx.db, "Row not found after conflict")
  }
}

fn user_link(
  ctx: Context,
  table,
  user_column,
  item_column,
  uri_column,
  plays_column,
  user: String,
  item: String,
  uri: String,
) {
  insert(table, [
    set(user_column, user),
    set(item_column, item),
    set(uri_column, uri),
    set(plays_column, Some(1)),
  ])
  |> on_conflict_update(
    [conflict_target(user_column), conflict_target(item_column)],
    [set(plays_column, Some(1))],
  )
  |> run(ctx.db)
  |> task.map(fn(_) { Nil })
}

pub fn insert_artist(ctx: Context, user: String, record: atp.Record) {
  use value <- task.then(
    decode.run(record.value, models.artist_record_decoder())
    |> error.decode("Artist record", _)
    |> task.from_result,
  )
  use created <- task.then(timestamp(value.created_at))
  let table = ar.table()
  let sha = hash(value.name)
  use artist <- task.then(insert_or_existing(
    ctx,
    insert(table, [
      set(ar.uri(table), Some(record.uri)),
      set(ar.name(table), value.name),
      set(ar.sha256(table), sha),
      set(ar.picture(table), value.picture_url),
      set(ar.genres(table), value.tags),
      set(ar.created_at(table), created),
    ])
      |> on_conflict_do_nothing,
    from(table) |> where(eq(ar.sha256(table), sha)),
  ))
  let links = ua.table()
  user_link(
    ctx,
    links,
    ua.user_id(links),
    ua.artist_id(links),
    ua.uri(links),
    ua.scrobbles(links),
    user,
    artist.id,
    record.uri,
  )
}

pub fn insert_album(ctx: Context, user: String, record: atp.Record) {
  use value <- task.then(
    decode.run(record.value, models.album_record_decoder())
    |> error.decode("Album record", _)
    |> task.from_result,
  )
  let artists = ar.table()
  use artist <- task.then(
    from(artists)
    |> where(eq(ar.name(artists), value.artist))
    |> required(ctx.db, "Album artist not found"),
  )
  let table = al.table()
  let sha = hash(value.title <> " - " <> value.artist)
  let art = Some(helpers.with_fallback_album_art(value.album_art_url))
  let updates = [
    set(al.album_art(table), art),
    set(al.artist_uri(table), artist.uri),
    ..list.flatten([
      case value.year {
        None -> []
        Some(v) -> [set(al.year(table), Some(v))]
      },
      case value.release_date {
        None -> []
        Some(v) -> [set(al.release_date(table), Some(v))]
      },
    ])
  ]
  use album <- task.then(insert_or_existing(
    ctx,
    insert(table, [
      set(al.title(table), value.title),
      set(al.artist(table), value.artist),
      set(al.uri(table), Some(record.uri)),
      set(al.sha256(table), sha),
      set(al.year(table), value.year),
      set(al.release_date(table), value.release_date),
      set(al.album_art(table), art),
      set(al.artist_uri(table), artist.uri),
    ])
      |> on_conflict_update([conflict_target(al.sha256(table))], updates),
    from(table) |> where(eq(al.sha256(table), sha)),
  ))
  let links = ul.table()
  use _ <- task.then(user_link(
    ctx,
    links,
    ul.user_id(links),
    ul.album_id(links),
    ul.uri(links),
    ul.scrobbles(links),
    user,
    album.id,
    record.uri,
  ))
  let links = aa.table()
  insert(links, [
    set(aa.album_id(links), album.id),
    set(aa.artist_id(links), artist.id),
  ])
  |> on_conflict_do_nothing
  |> run(ctx.db)
  |> task.map(fn(_) { Nil })
}

pub fn insert_song(ctx: Context, user: String, record: atp.Record) {
  let work = {
    use value <- task.then(
      decode.run(record.value, models.song_record_decoder())
      |> error.decode("Song record", _)
      |> task.from_result,
    )
    let artists = ar.table()
    let albums = al.table()
    use artist <- task.then(
      from(artists)
      |> where(eq(ar.name(artists), value.album_artist))
      |> required(ctx.db, "Song artist not found"),
    )
    use album <- task.then(
      from(albums)
      |> where(
        and([
          eq(al.title(albums), value.album),
          eq(al.artist(albums), value.album_artist),
        ]),
      )
      |> required(ctx.db, "Song album not found"),
    )
    use created <- task.then(timestamp(value.created_at))
    let table = tr.table()
    let sha = hash(value.title <> " - " <> value.artist <> " - " <> value.album)
    use track <- task.then(insert_or_existing(
      ctx,
      insert(table, [
        set(tr.title(table), value.title),
        set(tr.artist(table), value.artist),
        set(tr.album_artist(table), value.album_artist),
        set(tr.album(table), value.album),
        set(tr.uri(table), Some(record.uri)),
        set(
          tr.album_art(table),
          Some(helpers.with_fallback_album_art(value.album_art_url)),
        ),
        set(tr.artist_uri(table), artist.uri),
        set(tr.album_uri(table), album.uri),
        set(tr.sha256(table), sha),
        set(tr.duration(table), value.duration),
        set(tr.mb_id(table), value.mbid),
        set(tr.track_number(table), value.track_number),
        set(tr.disc_number(table), value.disc_number),
        set(tr.composer(table), value.composer),
        set(tr.label(table), value.label),
        set(tr.lyrics(table), value.lyrics),
        set(tr.genre(table), value.genre),
        set(tr.copyright_message(table), value.copyright_message),
        set(tr.spotify_link(table), value.spotify_link),
        set(tr.apple_music_link(table), value.apple_music_link),
        set(tr.tidal_link(table), value.tidal_link),
        set(tr.created_at(table), created),
      ])
        |> on_conflict_do_nothing,
      from(table)
        |> where(
          or([
            eq(tr.sha256(table), sha),
            case value.mbid {
              Some(id) if id != "" -> eq(tr.mb_id(table), Some(id))
              _ -> or([])
            },
          ]),
        ),
    ))
    let links = ut.table()
    use _ <- task.then(user_link(
      ctx,
      links,
      ut.user_id(links),
      ut.track_id(links),
      ut.uri(links),
      ut.scrobbles(links),
      user,
      track.id,
      record.uri,
    ))
    let album_tracks = alt.table()
    use _ <- task.then(
      insert(album_tracks, [
        set(alt.album_id(album_tracks), album.id),
        set(alt.track_id(album_tracks), track.id),
      ])
      |> on_conflict_do_nothing
      |> run(ctx.db),
    )
    let artist_tracks = at.table()
    insert(artist_tracks, [
      set(at.artist_id(artist_tracks), artist.id),
      set(at.track_id(artist_tracks), track.id),
    ])
    |> on_conflict_do_nothing
    |> run(ctx.db)
    |> task.map(fn(_) { Nil })
  }
  work
  |> task.rescue(fn(e) {
    log.error(
      "Failed to insert song " <> record.uri <> ": " <> error.describe(e),
    )
    task.ok(Nil)
  })
}

pub fn insert_scrobble(ctx: Context, user: String, record: atp.Record) {
  use value <- task.then(
    decode.run(record.value, models.scrobble_record_decoder())
    |> error.decode("Scrobble record", _)
    |> task.from_result,
  )
  let tracks = tr.table()
  let albums = al.table()
  let artists = ar.table()
  let sha = hash(value.title <> " - " <> value.artist <> " - " <> value.album)
  use track <- task.then(
    from(tracks)
    |> where(
      or([
        eq(tr.sha256(tracks), sha),
        case value.mbid {
          Some(id) if id != "" -> eq(tr.mb_id(tracks), Some(id))
          _ -> or([])
        },
      ]),
    )
    |> required(ctx.db, "Scrobble track not found"),
  )
  use album <- task.then(
    from(albums)
    |> where(eq(
      al.sha256(albums),
      hash(value.album <> " - " <> value.album_artist),
    ))
    |> required(ctx.db, "Scrobble album not found"),
  )
  use artist <- task.then(
    from(artists)
    |> where(eq(ar.sha256(artists), hash(value.album_artist)))
    |> required(ctx.db, "Scrobble artist not found"),
  )
  use created <- task.then(timestamp(value.created_at))
  let table = sc.table()
  use inserted <- task.then(
    insert(table, [
      set(sc.album_id(table), Some(album.id)),
      set(sc.track_id(table), Some(track.id)),
      set(sc.artist_id(table), Some(artist.id)),
      set(sc.uri(table), Some(record.uri)),
      set(sc.user_id(table), Some(user)),
      set(sc.timestamp(table), created),
      set(sc.created_at(table), created),
    ])
    |> on_conflict_do_nothing
    |> returning(ctx.db),
  )
  let work = {
    use found <- task.then(case inserted {
      [first, ..] -> task.ok(Some(first))
      [] ->
        from(table)
        |> where(
          or([
            eq(sc.uri(table), Some(record.uri)),
            and([
              eq(sc.user_id(table), Some(user)),
              eq(sc.track_id(table), Some(track.id)),
              eq(sc.timestamp(table), created),
            ]),
          ]),
        )
        |> one(ctx.db)
    })
    case found {
      None -> task.ok(Nil)
      Some(scrobble) ->
        publish.publish_scrobble(ctx, scrobble.id) |> task.map(fn(_) { Nil })
    }
  }
  work
  |> task.rescue(fn(e) {
    log.error("Failed to sync scrobble: " <> error.describe(e))
    task.ok(Nil)
  })
}

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [] -> task.fail(error.InvalidRequest("Usage: collections <handle|did>"))
    [actor, ..] -> {
      use did <- task.then(common.actor(ctx, actor))
      let users = us.table()
      use user <- task.then(
        from(users)
        |> where(eq(us.did(users), did))
        |> required(ctx.db, "User not found"),
      )
      use pds <- task.then(extract_pds.from_did(ctx.env.plc_directory_url, did))
      let agent = atp.atp_agent(pds)
      use scrobbles <- task.then(
        list_records(agent, did, "app.rocksky.scrobble", None, []),
      )
      use songs <- task.then(
        list_records(agent, did, "app.rocksky.song", None, []),
      )
      use artists <- task.then(
        list_records(agent, did, "app.rocksky.artist", None, []),
      )
      use albums <- task.then(
        list_records(agent, did, "app.rocksky.album", None, []),
      )
      use _ <- task.then(
        task.parallel_map(artists, fn(r) { insert_artist(ctx, user.id, r) }),
      )
      use _ <- task.then(
        task.parallel_map(albums, fn(r) { insert_album(ctx, user.id, r) }),
      )
      use _ <- task.then(
        task.parallel_map(songs, fn(r) { insert_song(ctx, user.id, r) }),
      )
      task.parallel_map(scrobbles, fn(r) { insert_scrobble(ctx, user.id, r) })
      |> task.map(fn(_) { Nil })
    }
  }
}

pub fn main() {
  common.run(execute)
}
