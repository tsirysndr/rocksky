import gleam/javascript/promise
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/atproto/agent as atproto
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, eq, eq_columns, field, from, inner_join, is_not_null, offset,
  one, order_by, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/navidrome_playlist_tracks as nt
import rocksky_api/drizzle/schema/navidrome_playlists as np
import rocksky_api/drizzle/schema/playlist_tracks as pt
import rocksky_api/drizzle/schema/playlists as p
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/log
import rocksky_api/playlists/service
import rocksky_api/task

fn agent_for(ctx: Context, did: String) {
  use agent <- task.then(agent.create(ctx, did))
  case agent {
    Some(a) -> task.ok(a)
    None ->
      task.fail(error.Message(
        "Your session with your PDS has expired, so the playlist could not be published to your repo.",
      ))
  }
}

pub fn ensure_playlist_record(
  ctx: Context,
  agent: atproto.Agent,
  did: String,
  playlist_id: String,
) {
  let users = u.table()
  let playlists = np.table()
  use user <- task.then(
    select(users, field("id", u.id(users)))
    |> where(eq(u.did(users), did))
    |> one(ctx.db)
    |> task.require_task("No Rocksky user for " <> did),
  )
  use row <- task.then(
    from(playlists)
    |> where(
      and([eq(np.id(playlists), playlist_id), eq(np.user_id(playlists), user)]),
    )
    |> one(ctx.db)
    |> task.require_task("Playlist " <> playlist_id <> " not found"),
  )
  case row.uri {
    Some(uri) if uri != "" -> task.ok(#(uri, False))
    _ -> {
      use created <- task.then(service.create(
        agent,
        row.name,
        row.description,
        None,
      ))
      use _ <- task.map(
        update(
          playlists,
          [set(np.uri(playlists), Some(created.uri))],
          eq(np.id(playlists), playlist_id),
        )
        |> run(ctx.db),
      )
      #(created.uri, True)
    }
  }
}

pub fn playlist_uri_of(ctx: Context, playlist_id: String) {
  let playlists = np.table()
  select(playlists, field("uri", np.uri(playlists)))
  |> where(eq(np.id(playlists), playlist_id))
  |> one(ctx.db)
  |> task.map(option.flatten)
}

fn song_uri_of(ctx: Context, song_id: String) {
  let tracks = t.table()
  use track <- task.then(
    from(tracks)
    |> where(eq(t.id(tracks), song_id))
    |> one(ctx.db)
    |> task.require_task("Song " <> song_id <> " not found"),
  )
  case track.uri {
    Some(uri) if uri != "" -> task.ok(uri)
    _ ->
      task.fail(error.Message(
        "“"
        <> track.title
        <> "” has no record on your PDS yet, so it could not be added to the playlist there.",
      ))
  }
}

pub fn song_uri_at_index(ctx: Context, playlist_id: String, index: Int) {
  let entries = nt.table()
  let tracks = t.table()
  select(entries, field("uri", t.uri(tracks)))
  |> inner_join(tracks, eq_columns(nt.track_id(entries), t.id(tracks)))
  |> where(eq(nt.playlist_id(entries), playlist_id))
  |> order_by([asc(nt.created_at(entries))])
  |> offset(index)
  |> one(ctx.db)
  |> task.map(option.flatten)
}

pub fn remove_one_entry(
  ctx: Context,
  agent: atproto.Agent,
  did: String,
  playlist_uri: String,
  song_uri: String,
) {
  let entries = pt.table()
  let playlists = p.table()
  let tracks = t.table()
  use entries <- task.then(
    select(entries, field("uri", pt.uri(entries)))
    |> inner_join(
      playlists,
      eq_columns(pt.playlist_id(entries), p.id(playlists)),
    )
    |> inner_join(tracks, eq_columns(pt.track_id(entries), t.id(tracks)))
    |> where(
      and([
        eq(p.uri(playlists), Some(playlist_uri)),
        eq(t.uri(tracks), Some(song_uri)),
        is_not_null(pt.uri(entries)),
      ]),
    )
    |> all(ctx.db),
  )
  let own =
    list.find_map(entries, fn(uri) {
      case uri {
        Some(uri) ->
          case service.at_uri_repo(uri) {
            Ok(repo) if repo == did -> Ok(uri)
            _ -> Error(Nil)
          }
        None -> Error(Nil)
      }
    })
  case own {
    Error(_) ->
      task.fail(error.Message(
        "The song was removed from your library playlist, but its record on your PDS is still being indexed and could not be retracted yet.",
      ))
    Ok(uri) ->
      atproto.delete_record(
        agent,
        did,
        service.playlist_song_collection,
        atproto.rkey_of(uri),
      )
      |> task.attempt_result
  }
}

pub fn mirror_create(ctx: Context, did: String, playlist_id: String) {
  use agent <- task.then(agent_for(ctx, did))
  ensure_playlist_record(ctx, agent, did, playlist_id)
  |> task.map(fn(r) { r.0 })
}

pub type UpdateChanges {
  UpdateChanges(
    name: Option(String),
    comment: Option(String),
    song_id_to_add: Option(String),
    removed_song_uri: Option(String),
  )
}

pub fn mirror_update(
  ctx: Context,
  did: String,
  playlist_id: String,
  changes: UpdateChanges,
) {
  use agent <- task.then(agent_for(ctx, did))
  update_with_agent(ctx, agent, did, playlist_id, changes)
}

pub fn update_with_agent(
  ctx: Context,
  agent: atproto.Agent,
  did: String,
  playlist_id: String,
  changes: UpdateChanges,
) {
  use record <- task.then(ensure_playlist_record(ctx, agent, did, playlist_id))
  let #(uri, published) = record
  use _ <- task.then(
    case
      !published
      && { option.is_some(changes.name) || option.is_some(changes.comment) }
    {
      True ->
        service.update(agent, did, uri, changes.name, changes.comment, None)
        |> task.map(fn(_) { Nil })
      False -> task.ok(Nil)
    },
  )
  use _ <- task.then(case changes.song_id_to_add {
    Some(id) if id != "" -> {
      use song_uri <- task.then(song_uri_of(ctx, id))
      service.add_songs(ctx, agent, did, uri, [song_uri])
      |> task.map(fn(_) { Nil })
    }
    _ -> task.ok(Nil)
  })
  use _ <- task.map(case changes.removed_song_uri {
    Some(song_uri) if song_uri != "" ->
      remove_one_entry(ctx, agent, did, uri, song_uri)
    _ -> task.ok(Nil)
  })
  uri
}

pub fn mirror_delete(ctx: Context, did: String, uri: String) {
  use agent <- task.then(agent_for(ctx, did))
  service.remove(ctx, agent, did, uri)
}

pub fn report_mirror(method: String, work: task.Task(a)) {
  promise.map(work, fn(outcome) {
    result.map_error(outcome, fn(e) {
      let message = error.to_string(e)
      log.error("[library." <> method <> "] atproto mirror failed: " <> message)
      message
    })
  })
}
