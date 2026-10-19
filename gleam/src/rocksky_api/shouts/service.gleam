import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, delete, eq, eq_columns, field, from, in_array, inner_join, insert,
  nullable, one, or, required, returning_one, run, select, set, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as ar
import rocksky_api/drizzle/schema/profile_shouts as ps
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/shout_likes as sl
import rocksky_api/drizzle/schema/shout_reports as sr
import rocksky_api/drizzle/schema/shouts as sh
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lexicon/validation
import rocksky_api/node/fetch
import rocksky_api/node/js
import rocksky_api/node/tid
import rocksky_api/notifications/service as notifications
import rocksky_api/notifications/song_activity
import rocksky_api/schema/shouts.{type Shout}
import rocksky_api/shouts/input.{type Input}
import rocksky_api/task

pub type Subject {
  Subject(
    collection: String,
    uri: String,
    track: Option(String),
    album: Option(String),
    artist: Option(String),
    scrobble: Option(String),
    owner: Option(String),
    profile: Option(String),
  )
}

fn empty_subject(collection: String, uri: String) {
  Subject(collection, uri, None, None, None, None, None, None)
}

pub fn user(ctx: Context, did: String) {
  let users = u.table()
  select(users, field("id", u.id(users)))
  |> where(eq(u.did(users), did))
  |> required(ctx.db, "User not found")
}

pub fn resolve_uri(ctx: Context, id: String) {
  case string.starts_with(id, "at://") {
    True -> task.ok(id)
    False -> {
      let shouts = sh.table()
      select(shouts, field("uri", sh.uri(shouts)))
      |> where(eq(sh.id(shouts), id))
      |> required(ctx.db, "Shout not found")
    }
  }
}

pub fn resolve_subject(ctx: Context, uri: String) {
  case
    string.contains(uri, "app.rocksky.song"),
    string.contains(uri, "app.rocksky.album"),
    string.contains(uri, "app.rocksky.artist"),
    string.contains(uri, "app.rocksky.scrobble")
  {
    True, _, _, _ -> {
      let table = tr.table()
      use track <- task.map(
        from(table)
        |> where(eq(tr.uri(table), Some(uri)))
        |> required(ctx.db, "Track not found"),
      )
      Subject(..empty_subject("app.rocksky.song", uri), track: Some(track.id))
    }
    _, True, _, _ -> {
      let table = al.table()
      use album <- task.map(
        from(table)
        |> where(eq(al.uri(table), Some(uri)))
        |> required(ctx.db, "Album not found"),
      )
      Subject(..empty_subject("app.rocksky.album", uri), album: Some(album.id))
    }
    _, _, True, _ -> {
      let table = ar.table()
      use artist <- task.map(
        from(table)
        |> where(eq(ar.uri(table), Some(uri)))
        |> required(ctx.db, "Artist not found"),
      )
      Subject(
        ..empty_subject("app.rocksky.artist", uri),
        artist: Some(artist.id),
      )
    }
    _, _, _, True -> {
      let table = sc.table()
      let tracks = tr.table()
      let albums = al.table()
      let artists = ar.table()
      use scrobble <- task.map(
        from(table)
        |> inner_join(
          tracks,
          eq_columns(sc.track_id(table), nullable(tr.id(tracks))),
        )
        |> inner_join(
          albums,
          eq_columns(sc.album_id(table), nullable(al.id(albums))),
        )
        |> inner_join(
          artists,
          eq_columns(sc.artist_id(table), nullable(ar.id(artists))),
        )
        |> where(eq(sc.uri(table), Some(uri)))
        |> required(ctx.db, "Scrobble not found"),
      )
      Subject(
        ..empty_subject("app.rocksky.scrobble", uri),
        scrobble: Some(scrobble.id),
        owner: scrobble.user_id,
      )
    }
    _, _, _, _ -> {
      let table = u.table()
      let target = string.replace(uri, "at://", "")
      use profile <- task.map(
        from(table)
        |> where(or([eq(u.did(table), target), eq(u.handle(table), target)]))
        |> required(ctx.db, "Profile not found"),
      )
      Subject(
        ..empty_subject("app.bsky.actor.profile", "at://" <> profile.did),
        owner: Some(profile.id),
        profile: Some(profile.id),
      )
    }
  }
}

fn ref(record: agent.Record, uri: String) {
  use cid <- task.then(
    task.from_result(task.require(record.cid, "Missing record CID")),
  )
  let value = models.StrongRef(uri, cid)
  use _ <- task.map(
    task.from_result(validation.record(
      "com.atproto.repo.strongRef",
      models.encode_strong_ref(value),
    )),
  )
  value
}

// The source resolves public subject records against the first PLC service.
pub fn public_ref(ctx: Context, uri: String) {
  let did =
    uri
    |> string.drop_start(5)
    |> string.split("/")
    |> list.first
    |> option.from_result
    |> option.unwrap("")
  let collection =
    uri
    |> string.split("/")
    |> list.drop(3)
    |> list.first
    |> option.from_result
    |> option.unwrap("")
  use doc <- task.then(
    task.attempt_result(fetch.get(
      ctx.env.plc_directory_url <> "/" <> did,
      [],
      False,
    )),
  )
  use endpoint <- task.then(
    decode.run(
      doc.data,
      decode.at(
        ["service"],
        decode.list(decode.at(["serviceEndpoint"], decode.string)),
      ),
    )
    |> error.decode("PDS", _)
    |> task.from_result
    |> task.try_map(fn(services) {
      services
      |> list.first
      |> option.from_result
      |> task.require("Missing PDS")
    }),
  )
  use record <- task.then(
    task.attempt_result(agent.get_record(
      agent.atp_agent(endpoint),
      did,
      collection,
      agent.rkey_of(uri),
    )),
  )
  ref(record, uri)
}

fn record(
  input: Input,
  subject: models.StrongRef,
  parent: Option(models.StrongRef),
) {
  json.object([
    #("$type", json.string("app.rocksky.shout")),
    #("subject", models.encode_strong_ref(subject)),
    #("createdAt", json.string(row.iso8601(row.from_unix_ms(js.now_ms())))),
    ..list.append(input.fields(input), case parent {
      None -> []
      Some(p) -> [#("parent", models.encode_strong_ref(p))]
    })
  ])
}

fn insert_shout(
  ctx: Context,
  input: Input,
  uri: String,
  author: String,
  subject: Subject,
  parent: Option(String),
) {
  let table = sh.table()
  let facets = case input.facets {
    [] -> None
    fs -> Some(js.coerce(json.array(fs, models.encode_shout_mention)))
  }
  insert(table, [
    set(sh.content(table), option.unwrap(input.message, "")),
    set(sh.uri(table), uri),
    set(sh.author_id(table), author),
    set(sh.track_id(table), subject.track),
    set(sh.album_id(table), subject.album),
    set(sh.artist_id(table), subject.artist),
    set(sh.scrobble_id(table), subject.scrobble),
    set(sh.parent_id(table), parent),
    set(sh.gif_url(table), option.map(input.gif, fn(g) { g.url })),
    set(
      sh.gif_preview_url(table),
      option.then(input.gif, fn(g) { g.preview_url }),
    ),
    set(sh.gif_alt(table), option.then(input.gif, fn(g) { g.alt })),
    set(sh.gif_width(table), option.then(input.gif, fn(g) { g.width })),
    set(sh.gif_height(table), option.then(input.gif, fn(g) { g.height })),
    set(sh.facets(table), facets),
  ])
  |> returning_one(ctx.db, "Shout not created")
}

fn profile_link(ctx: Context, profile: Option(String), shout: String) {
  case profile {
    None -> task.ok(Nil)
    Some(id) -> {
      let table = ps.table()
      insert(table, [set(ps.user_id(table), id), set(ps.shout_id(table), shout)])
      |> run(ctx.db)
      |> task.map(fn(_) { Nil })
    }
  }
}

fn mentions(
  ctx: Context,
  input: Input,
  actor: String,
  shout: String,
  uri: String,
  skip: List(String),
) {
  let users = u.table()
  let dids = list.map(input.facets, fn(f) { f.did }) |> list.unique
  use ids <- task.then(case dids {
    [] -> task.ok([])
    _ ->
      select(users, field("id", u.id(users)))
      |> where(in_array(u.did(users), dids))
      |> all(ctx.db)
  })
  ids
  |> list.filter(fn(id) { !list.contains(skip, id) })
  |> task.each_(fn(id) {
    notifications.create(
      ctx,
      Some(id),
      Some(actor),
      "mention",
      Some(shout),
      Some(uri),
    )
  })
}

pub fn create(
  ctx: Context,
  input: Input,
  uri: String,
  author: String,
  agent: agent.Agent,
) {
  use input <- task.then(task.from_result(input.validate(input)))
  use subject <- task.then(resolve_subject(ctx, uri))
  use did <- task.then(
    task.from_result(task.require(agent.did(agent), "Missing agent DID")),
  )
  let rkey = case subject.profile {
    Some(_) -> "self"
    None -> agent.rkey_of(subject.uri)
  }
  use subject_record <- task.then(
    task.attempt_result(agent.get_record(agent, did, subject.collection, rkey)),
  )
  use subject_ref <- task.then(ref(subject_record, subject_record.uri))
  let record = record(input, subject_ref, None)
  use _ <- task.then(
    task.from_result(validation.record("app.rocksky.shout", record)),
  )
  use created <- task.then(
    task.attempt_result(agent.create_record_unchecked(
      agent,
      did,
      "app.rocksky.shout",
      tid.next(),
      record,
    )),
  )
  use shout <- task.then(insert_shout(
    ctx,
    input,
    created.uri,
    author,
    subject,
    None,
  ))
  use _ <- task.then(profile_link(ctx, subject.profile, shout.id))
  let kind = case subject.profile {
    Some(_) -> "comment_profile"
    None -> "comment_scrobble"
  }
  use notified <- task.then(case subject.track {
    Some(track) ->
      song_activity.notify_shout(
        ctx,
        track,
        subject.uri,
        author,
        shout.id,
        None,
      )
    None -> {
      use _ <- task.map(notifications.create(
        ctx,
        subject.owner,
        Some(author),
        kind,
        Some(shout.id),
        Some(subject.uri),
      ))
      case subject.owner {
        Some(id) -> [id]
        None -> []
      }
    }
  })
  mentions(ctx, input, author, shout.id, subject.uri, notified)
}

fn reply_subject(ctx: Context, shout: Shout, fallback: String) {
  let tracks = tr.table()
  let albums = al.table()
  let artists = ar.table()
  let scrobbles = sc.table()
  use candidates <- task.then(
    task.all([
      select(tracks, field("uri", tr.uri(tracks)))
        |> where(eq(nullable(tr.id(tracks)), shout.track_id))
        |> one(ctx.db),
      select(albums, field("uri", al.uri(albums)))
        |> where(eq(nullable(al.id(albums)), shout.album_id))
        |> one(ctx.db),
      select(artists, field("uri", ar.uri(artists)))
        |> where(eq(nullable(ar.id(artists)), shout.artist_id))
        |> one(ctx.db),
      select(scrobbles, field("uri", sc.uri(scrobbles)))
        |> where(eq(nullable(sc.id(scrobbles)), shout.scrobble_id))
        |> one(ctx.db),
    ]),
  )
  let uri =
    candidates
    |> list.filter_map(fn(o) { o |> option.flatten |> option.to_result(Nil) })
    |> list.first
    |> option.from_result
    |> option.unwrap(fallback)
  let profiles = ps.table()
  use profile <- task.map(
    case shout.track_id, shout.album_id, shout.artist_id, shout.scrobble_id {
      None, None, None, None ->
        select(profiles, field("user", ps.user_id(profiles)))
        |> where(eq(ps.shout_id(profiles), shout.id))
        |> one(ctx.db)
      _, _, _, _ -> task.ok(None)
    },
  )
  Subject(
    "",
    uri,
    shout.track_id,
    shout.album_id,
    shout.artist_id,
    shout.scrobble_id,
    None,
    profile,
  )
}

pub fn reply(
  ctx: Context,
  input: Input,
  id: String,
  author: String,
  agent: agent.Agent,
) {
  use input <- task.then(task.from_result(input.validate(input)))
  use uri <- task.then(resolve_uri(ctx, id))
  let table = sh.table()
  use parent <- task.then(
    from(table)
    |> where(eq(sh.uri(table), uri))
    |> required(ctx.db, "Shout not found"),
  )
  use did <- task.then(
    task.from_result(task.require(agent.did(agent), "Missing agent DID")),
  )
  use profile <- task.then(
    task.attempt_result(agent.get_record(
      agent,
      did,
      "app.bsky.actor.profile",
      "self",
    )),
  )
  use subject <- task.then(reply_subject(ctx, parent, profile.uri))
  use subject_ref <- task.then(public_ref(ctx, subject.uri))
  use parent_ref <- task.then(public_ref(ctx, uri))
  let record = record(input, subject_ref, Some(parent_ref))
  use _ <- task.then(
    task.from_result(validation.record("app.rocksky.shout", record)),
  )
  use created <- task.then(
    task.attempt_result(agent.create_record_unchecked(
      agent,
      did,
      "app.rocksky.shout",
      tid.next(),
      record,
    )),
  )
  use shout <- task.then(insert_shout(
    ctx,
    input,
    created.uri,
    author,
    subject,
    Some(parent.id),
  ))
  use _ <- task.then(profile_link(ctx, subject.profile, shout.id))
  use notified <- task.then(case subject.track {
    Some(track) ->
      song_activity.notify_shout(
        ctx,
        track,
        subject.uri,
        author,
        shout.id,
        Some(parent.author_id),
      )
    None -> {
      use _ <- task.map(notifications.create(
        ctx,
        Some(parent.author_id),
        Some(author),
        "reply",
        Some(shout.id),
        Some(subject.uri),
      ))
      [parent.author_id]
    }
  })
  mentions(ctx, input, author, shout.id, subject.uri, notified)
}

fn existing_like(ctx: Context, uri: String, user: String) {
  let likes = sl.table()
  let shouts = sh.table()
  from(likes)
  |> inner_join(shouts, eq_columns(sl.shout_id(likes), sh.id(shouts)))
  |> where(and([eq(sh.uri(shouts), uri), eq(sl.user_id(likes), user)]))
  |> one(ctx.db)
}

pub fn like(ctx: Context, uri: String, user: String, agent: agent.Agent) {
  use existing <- task.then(existing_like(ctx, uri, user))
  case existing {
    Some(_) -> task.ok(Nil)
    None -> {
      use subject <- task.then(public_ref(ctx, uri))
      let record =
        json.object([
          #("$type", json.string("app.rocksky.like")),
          #("subject", models.encode_strong_ref(subject)),
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
      let shouts = sh.table()
      use shout <- task.then(
        from(shouts)
        |> where(eq(sh.uri(shouts), uri))
        |> required(ctx.db, "Shout not found"),
      )
      let likes = sl.table()
      use _ <- task.then(
        insert(likes, [
          set(sl.shout_id(likes), shout.id),
          set(sl.user_id(likes), user),
          set(sl.uri(likes), created.uri),
        ])
        |> run(ctx.db),
      )
      notifications.create(
        ctx,
        Some(shout.author_id),
        Some(user),
        "react_comment",
        Some(shout.id),
        Some(shout.uri),
      )
      |> task.map(fn(_) { Nil })
    }
  }
}

pub fn unlike(ctx: Context, uri: String, user: String, agent: agent.Agent) {
  use existing <- task.then(existing_like(ctx, uri, user))
  case existing {
    None -> task.ok(Nil)
    Some(like) -> {
      use did <- task.then(
        task.from_result(task.require(agent.did(agent), "Missing agent DID")),
      )
      let likes = sl.table()
      task.all2(
        task.attempt_result(agent.delete_record(
          agent,
          did,
          "app.rocksky.like",
          agent.rkey_of(like.uri),
        )),
        delete(likes, eq(sl.id(likes), like.id)) |> run(ctx.db),
      )
      |> task.map(fn(_) { Nil })
    }
  }
}

pub fn remove(ctx: Context, id: String, user: String, agent: agent.Agent) {
  use uri <- task.then(resolve_uri(ctx, id))
  let shouts = sh.table()
  use shout <- task.then(
    from(shouts)
    |> where(eq(sh.uri(shouts), uri))
    |> required(ctx.db, "Shout not found"),
  )
  use _ <- task.then(case shout.author_id == user {
    True -> task.ok(Nil)
    False -> task.fail(error.Forbidden("Forbidden"))
  })
  use replies <- task.then(
    select(shouts, field("id", sh.id(shouts)))
    |> where(eq(sh.parent_id(shouts), Some(shout.id)))
    |> all(ctx.db),
  )
  let ids = [shout.id, ..replies]
  let likes = sl.table()
  let reports = sr.table()
  let profiles = ps.table()
  use _ <- task.then(
    delete(likes, in_array(sl.shout_id(likes), ids)) |> run(ctx.db),
  )
  use _ <- task.then(
    delete(reports, in_array(sr.shout_id(reports), ids)) |> run(ctx.db),
  )
  use _ <- task.then(
    delete(profiles, in_array(ps.shout_id(profiles), ids)) |> run(ctx.db),
  )
  use _ <- task.then(
    delete(shouts, in_array(sh.id(shouts), replies)) |> run(ctx.db),
  )
  use _ <- task.then(delete(shouts, eq(sh.id(shouts), shout.id)) |> run(ctx.db))
  use did <- task.then(
    task.from_result(task.require(agent.did(agent), "Missing agent DID")),
  )
  task.attempt_result(agent.delete_record(
    agent,
    did,
    "app.rocksky.shout",
    agent.rkey_of(shout.uri),
  ))
}
