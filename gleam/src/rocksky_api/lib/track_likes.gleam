//// Like counts and the caller's own like, matched by sha256 rather than row
//// id: the same song can exist as several `tracks` rows.

import gleam/dict
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, eq_columns, field, in_array, inner_join, left_join, nullable, pair,
  select, where,
}
import rocksky_api/drizzle/schema/loved_tracks
import rocksky_api/drizzle/schema/tracks
import rocksky_api/drizzle/schema/users
import rocksky_api/task.{type Task}

pub type Likes {
  Likes(likes_count: Int, liked: Bool)
}

/// Likes per track id, for the given ids. Missing ids have zero likes.
pub fn for_track_ids(
  ctx: Context,
  track_ids: List(String),
  did: Option(String),
) -> Task(dict.Dict(String, Likes)) {
  let track_ids = list.unique(track_ids)
  case track_ids {
    [] -> task.ok(dict.new())
    _ -> {
      let t = tracks.table()
      let u = users.table()
      let lt = loved_tracks.table()
      use identities <- task.then(
        select(
          t,
          pair(field("id", tracks.id(t)), field("sha", tracks.sha256(t))),
        )
        |> where(in_array(tracks.id(t), track_ids))
        |> all(ctx.db),
      )
      let shas =
        list.unique(list.map(identities, fn(i) { i.1 }))
        |> list.filter(fn(s) { s != "" })
      case shas {
        [] ->
          task.ok(
            dict.from_list(
              list.map(track_ids, fn(id) { #(id, Likes(0, False)) }),
            ),
          )
        _ -> {
          use likes <- task.map(
            select(
              lt,
              pair(
                field("sha", tracks.sha256(t)),
                field("did", nullable(users.did(u))),
              ),
            )
            |> inner_join(
              t,
              eq_columns(loved_tracks.track_id(lt), tracks.id(t)),
            )
            |> left_join(u, eq_columns(loved_tracks.user_id(lt), users.id(u)))
            |> where(in_array(tracks.sha256(t), shas))
            |> all(ctx.db),
          )
          let sha_by_id = dict.from_list(identities)
          dict.from_list(
            list.map(track_ids, fn(id) {
              let for_track = case dict.get(sha_by_id, id) {
                Ok(sha) -> list.filter(likes, fn(l) { l.0 == sha })
                Error(_) -> []
              }
              let liked = case did {
                Some(d) -> list.any(for_track, fn(l) { l.1 == Some(d) })
                None -> False
              }
              #(id, Likes(list.length(for_track), liked))
            }),
          )
        }
      }
    }
  }
}

pub fn for_track_id(
  ctx: Context,
  track_id: String,
  did: Option(String),
) -> Task(Likes) {
  use likes <- task.map(for_track_ids(ctx, [track_id], did))
  dict.get(likes, track_id) |> result_or(Likes(0, False))
}

fn result_or(r: Result(a, b), default: a) -> a {
  case r {
    Ok(v) -> v
    Error(_) -> default
  }
}

pub fn get(likes: dict.Dict(String, Likes), track_id: String) -> Likes {
  dict.get(likes, track_id) |> result_or(Likes(0, False))
}
