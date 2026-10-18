import gleam/dynamic/decode
import gleam/list
import gleam/option.{None, Some}
import gleam/result
import gleam/string
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, and, asc, eq, eq_columns, field, from, inner_join, order_by, required,
  select, where,
}
import rocksky_api/drizzle/schema/navidrome_playlist_tracks as nt
import rocksky_api/drizzle/schema/navidrome_playlists as np
import rocksky_api/drizzle/schema/tracks as tr
import rocksky_api/drizzle/schema/users as us
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/lib/extract_pds
import rocksky_api/library/playlist_mirror
import rocksky_api/log
import rocksky_api/playlists/service
import rocksky_api/scripts/common
import rocksky_api/task

pub fn published(
  agent: atp.Agent,
  repo: String,
  uri: String,
  cursor: option.Option(String),
  acc: List(String),
) {
  use page <- task.then(
    atp.list_records(
      agent,
      repo,
      service.playlist_song_collection,
      100,
      cursor,
      False,
    )
    |> task.attempt_result,
  )
  let found =
    list.filter_map(page.records, fn(record) {
      use playlist <- result.try(decode.run(
        record.value,
        decode.at(["playlist", "uri"], decode.string),
      ))
      case playlist == uri {
        True ->
          decode.run(record.value, decode.at(["song", "uri"], decode.string))
        False -> Error([])
      }
    })
  let acc = list.append(acc, found)
  case page.cursor {
    Some(cursor) -> published(agent, repo, uri, Some(cursor), acc)
    None -> task.ok(list.unique(acc))
  }
}

pub fn execute(ctx: Context, args: List(String)) {
  case args {
    [did, id, ..flags] ->
      case string.starts_with(did, "did:") && id != "" {
        False ->
          task.fail(error.InvalidRequest("Expected DID and library playlist id"))
        True -> {
          let users = us.table()
          use user <- task.then(
            from(users)
            |> where(eq(us.did(users), did))
            |> required(ctx.db, "No Rocksky user for " <> did),
          )
          let playlists = np.table()
          use _ <- task.then(
            from(playlists)
            |> where(
              and([eq(np.id(playlists), id), eq(np.user_id(playlists), user.id)]),
            )
            |> required(ctx.db, "Playlist not found"),
          )
          let tracks = tr.table()
          let entries = nt.table()
          use uris <- task.then(
            select(entries, field("uri", tr.uri(tracks)))
            |> inner_join(
              tracks,
              eq_columns(nt.track_id(entries), tr.id(tracks)),
            )
            |> where(eq(nt.playlist_id(entries), id))
            |> order_by([asc(nt.created_at(entries))])
            |> all(ctx.db),
          )
          let uris =
            list.filter_map(uris, fn(u) { option.to_result(u, Nil) })
            |> list.filter(fn(u) { u != "" })
          case list.contains(flags, "--dry-run") {
            True -> {
              log.info("Dry run: playlist and song records would be published")
              task.ok(Nil)
            }
            False -> {
              use agent <- task.then(agent.require(ctx, did))
              use record <- task.then(playlist_mirror.ensure_playlist_record(
                ctx,
                agent,
                did,
                id,
              ))
              use repo <- task.then(
                service.at_uri_repo(record.0) |> task.from_result,
              )
              use pds <- task.then(extract_pds.from_did(
                ctx.env.plc_directory_url,
                repo,
              ))
              use existing <- task.then(
                published(atp.atp_agent(pds), repo, record.0, None, []),
              )
              uris
              |> list.filter(fn(uri) { !list.contains(existing, uri) })
              |> common.each(fn(uri) {
                service.add_songs(ctx, agent, did, record.0, [uri])
                |> task.map(fn(_) { Nil })
                |> task.rescue(fn(e) {
                  log.error(
                    "Failed to add " <> uri <> ": " <> error.describe(e),
                  )
                  task.ok(Nil)
                })
              })
            }
          }
        }
      }
    _ ->
      task.fail(error.InvalidRequest(
        "Usage: gleam run -m rocksky_api/scripts/sync_library_playlist -- <did> <playlistId> [--dry-run]",
      ))
  }
}

pub fn main() {
  common.run(execute)
}
