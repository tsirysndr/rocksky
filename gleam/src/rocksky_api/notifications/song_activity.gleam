//// Song activity reaches explicit participants rather than passive listeners.

import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, eq, eq_columns, field, group_by, inner_join, one, reference, select,
  where,
}
import rocksky_api/drizzle/schema/loved_tracks as loved
import rocksky_api/drizzle/schema/shouts as sh
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/log
import rocksky_api/notifications/service
import rocksky_api/playlists/service as playlists
import rocksky_api/task

pub fn recipients(ctx: Context, track: String, uri: String) {
  let likes = loved.table()
  let users = u.table()
  use owner_did <- task.then(task.from_result(playlists.at_uri_repo(uri)))
  use #(lovers, owner) <- task.map(task.all2(
    select(likes, field("user", u.id(users)))
      |> inner_join(users, eq_columns(loved.user_id(likes), u.id(users)))
      |> where(eq(loved.track_id(likes), track))
      |> group_by([reference(u.id(users))])
      |> all(ctx.db),
    select(users, field("user", u.id(users)))
      |> where(eq(u.did(users), owner_did))
      |> one(ctx.db),
  ))
  case owner {
    Some(id) -> list.unique([id, ..lovers])
    None -> lovers
  }
}

pub fn notify(ctx: Context, track: String, uri: String, actor: String) {
  {
    use ids <- task.then(recipients(ctx, track, uri))
    service.create_many(ctx, ids, Some(actor), "like_scrobble", None, Some(uri))
  }
  |> task.rescue(fn(e) {
    log.error(
      "Failed to fan out song-like notifications: " <> error.describe(e),
    )
    task.ok([])
  })
}

/// New shouts also reach previous participants, including replies. The direct
/// reply recipient keeps the reply type; everyone else receives a song comment.
pub fn notify_shout(
  ctx: Context,
  track: String,
  uri: String,
  actor: String,
  shout: String,
  reply_to: Option(String),
) {
  {
    let shouts = sh.table()
    let users = u.table()
    use #(ids, authors) <- task.then(task.all2(
      recipients(ctx, track, uri),
      select(shouts, field("author", u.id(users)))
        |> inner_join(users, eq_columns(sh.author_id(shouts), u.id(users)))
        |> where(eq(sh.track_id(shouts), Some(track)))
        |> group_by([reference(u.id(users))])
        |> all(ctx.db),
    ))
    let ids = list.unique(list.append(ids, authors))
    use _ <- task.then(service.create_many(
      ctx,
      list.filter(ids, fn(id) { Some(id) != reply_to }),
      Some(actor),
      "comment_scrobble",
      Some(shout),
      Some(uri),
    ))
    use _ <- task.map(service.create(
      ctx,
      reply_to,
      Some(actor),
      "reply",
      Some(shout),
      Some(uri),
    ))
    case reply_to {
      Some(id) -> list.unique([id, ..ids])
      None -> ids
    }
  }
  |> task.rescue(fn(e) {
    log.error(
      "Failed to fan out song-shout notifications: " <> error.describe(e),
    )
    task.ok([])
  })
}
