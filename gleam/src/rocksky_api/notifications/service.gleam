import gleam/dict
import gleam/dynamic
import gleam/int
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, and, count as db_count, desc, eq, eq_columns, field, from, in_array,
  insert, left_join, limit as db_limit, lt, map, nullable, one, order_by, pair,
  required, returning_one, run, select, set, update, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/notifications as n
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/shouts as sh
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/helpers
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/node/pg
import rocksky_api/schema/notifications
import rocksky_api/task.{type Task}

pub fn subject(user_id: String) -> String {
  "rocksky.notification."
  <> {
    user_id
    |> string.to_graphemes
    |> list.map(fn(c) {
      case
        string.contains(
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
          c,
        )
      {
        True -> c
        False -> "_"
      }
    })
    |> string.concat
  }
}

pub fn publish(ctx: Context, user_id: String, payload: json.Json) -> Nil {
  case
    js.try_catch(fn() {
      nats.publish(ctx.nc, subject(user_id), json.to_string(payload))
    })
  {
    Ok(_) -> Nil
    Error(e) ->
      log.error("Failed to publish notification event: " <> js.message(e))
  }
}

pub fn user_id(ctx: Context, did: Option(String)) -> Task(Option(String)) {
  case did {
    None -> task.ok(None)
    Some(did) -> {
      let table = u.table()
      select(table, field("id", u.id(table)))
      |> where(eq(u.did(table), did))
      |> one(ctx.db)
    }
  }
}

pub fn unread_count(ctx: Context, user_id: String) -> Task(Int) {
  let table = n.table()
  select(table, field("count", db_count()))
  |> where(and([eq(n.user_id(table), user_id), eq(n.read(table), False)]))
  |> required(ctx.db, "Missing notification count")
}

pub fn mark_seen(
  ctx: Context,
  user_id: String,
  ids: List(String),
) -> Task(Int) {
  let table = n.table()
  let filters = [eq(n.user_id(table), user_id), eq(n.read(table), False)]
  let filters = case ids {
    [] -> filters
    _ -> [in_array(n.id(table), ids), ..filters]
  }
  use _ <- task.then(
    update(
      table,
      [
        set(n.read(table), True),
        set(n.read_at(table), Some(row.from_unix_ms(js.now_ms()))),
      ],
      and(filters),
    )
    |> run(ctx.db),
  )
  use count <- task.map(unread_count(ctx, user_id))
  publish(
    ctx,
    user_id,
    json.object([
      #("type", json.string("seen")),
      #("unreadCount", json.int(count)),
    ]),
  )
  count
}

pub fn list_notifications(
  ctx: Context,
  user_id: String,
  limit: Int,
  cursor: Option(String),
) -> Task(#(List(models.NotificationView), Option(String))) {
  let limit = int.clamp(limit, 1, 100)
  let table = n.table()
  use filters <- task.then(case cursor {
    None | Some("") -> task.ok([eq(n.user_id(table), user_id)])
    Some(value) ->
      case pg.to_ms(dynamic.string(value)) {
        Some(ms) ->
          task.ok([
            eq(n.user_id(table), user_id),
            lt(n.created_at(table), row.from_unix_ms(ms)),
          ])
        None -> task.fail(error.InvalidRequest("Invalid notification cursor"))
      }
  })
  use rows <- task.then(
    from(table)
    |> where(and(filters))
    |> order_by([desc(n.created_at(table))])
    |> db_limit(limit + 1)
    |> all(ctx.db),
  )
  let page = list.take(rows, limit)
  let cursor = case list.length(rows) > limit {
    True ->
      list.last(page)
      |> option.from_result
      |> option.map(fn(n) { row.iso8601(n.created_at) })
    False -> None
  }
  use views <- task.map(hydrate(ctx, page))
  #(views, cursor)
}

pub fn create(
  ctx: Context,
  recipient: Option(String),
  actor: Option(String),
  kind: String,
  shout: Option(String),
  uri: Option(String),
) -> Task(Option(notifications.Notification)) {
  case recipient, actor {
    Some(user_id), Some(actor_id)
      if user_id != "" && actor_id != "" && user_id != actor_id
    -> {
      use result <- task.rescue({
        let table = n.table()
        use created <- task.then(
          insert(table, [
            set(n.user_id(table), user_id),
            set(n.actor_id(table), actor_id),
            set(n.type_(table), kind),
            set(n.shout_id(table), shout),
            set(n.subject_uri(table), uri),
          ])
          |> returning_one(ctx.db, "Notification not created"),
        )
        use count <- task.then(unread_count(ctx, user_id))
        use views <- task.map(hydrate(ctx, [created]))
        let payload = [
          #("type", json.string("notification")),
          #("unreadCount", json.int(count)),
        ]
        let payload = case views {
          [view, ..] -> [
            #("notification", models.encode_notification_view(view)),
            ..payload
          ]
          [] -> payload
        }
        publish(ctx, user_id, json.object(payload))
        Some(created)
      })
      log.error("Failed to create notification: " <> error.to_string(result))
      task.ok(None)
    }
    _, _ -> task.ok(None)
  }
}

fn subject_selection(uri, title, artist, art) {
  pair(
    pair(field("uri", uri), field("title", title)),
    pair(field("artist", artist), field("art", art)),
  )
  |> map(fn(v) {
    option.map(v.0.0, fn(uri) {
      #(
        uri,
        models.NotificationSubjectView(
          uri,
          v.0.1,
          v.1.0,
          Some(helpers.with_fallback_album_art(v.1.1)),
        ),
      )
    })
  })
}

fn subjects(ctx: Context, rows: List(notifications.Notification)) {
  let uris =
    list.filter_map(rows, fn(n) { n.subject_uri |> option.to_result(Nil) })
    |> list.unique
  let scrobbles = sc.table()
  let tracks = t.table()
  let albums = al.table()
  let queries = [
    #(
      list.filter(uris, string.contains(_, "app.rocksky.scrobble")),
      select(
        scrobbles,
        subject_selection(
          sc.uri(scrobbles),
          nullable(t.title(tracks)),
          nullable(t.artist(tracks)),
          t.album_art(tracks),
        ),
      )
        |> left_join(
          tracks,
          eq_columns(sc.track_id(scrobbles), nullable(t.id(tracks))),
        ),
      sc.uri(scrobbles),
    ),
    #(
      list.filter(uris, string.contains(_, "app.rocksky.song")),
      select(
        tracks,
        subject_selection(
          t.uri(tracks),
          nullable(t.title(tracks)),
          nullable(t.artist(tracks)),
          t.album_art(tracks),
        ),
      ),
      t.uri(tracks),
    ),
    #(
      list.filter(uris, string.contains(_, "app.rocksky.album")),
      select(
        albums,
        subject_selection(
          al.uri(albums),
          nullable(al.title(albums)),
          nullable(al.artist(albums)),
          al.album_art(albums),
        ),
      ),
      al.uri(albums),
    ),
  ]
  use groups <- task.map(
    task.each(queries, fn(q) {
      case q.0 {
        [] -> task.ok([])
        values ->
          q.1 |> where(in_array(q.2, list.map(values, Some))) |> all(ctx.db)
      }
    }),
  )
  groups
  |> list.flatten
  |> list.filter_map(option.to_result(_, Nil))
  |> dict.from_list
}

pub fn hydrate(
  ctx: Context,
  rows: List(notifications.Notification),
) -> Task(List(models.NotificationView)) {
  case rows {
    [] -> task.ok([])
    _ -> {
      let users = u.table()
      let shouts = sh.table()
      let actor_ids = list.map(rows, fn(n) { n.actor_id }) |> list.unique
      let shout_ids =
        list.filter_map(rows, fn(n) { n.shout_id |> option.to_result(Nil) })
        |> list.unique
      let actor_selection =
        pair(
          pair(field("id", u.id(users)), field("did", u.did(users))),
          pair(
            field("handle", u.handle(users)),
            pair(
              field("name", nullable(u.display_name(users))),
              field("avatar", u.avatar(users)),
            ),
          ),
        )
        |> map(fn(v) {
          #(
            v.0.0,
            models.NotificationActor(
              Some(v.0.0),
              Some(v.0.1),
              Some(v.1.0),
              v.1.1.0,
              Some(v.1.1.1),
            ),
          )
        })
      use actors <- task.then(
        select(users, actor_selection)
        |> where(in_array(u.id(users), actor_ids))
        |> all(ctx.db),
      )
      use shout_rows <- task.then(case shout_ids {
        [] -> task.ok([])
        _ ->
          select(
            shouts,
            pair(
              field("id", sh.id(shouts)),
              field("content", sh.content(shouts)),
            ),
          )
          |> where(in_array(sh.id(shouts), shout_ids))
          |> all(ctx.db)
      })
      use subject_map <- task.map(subjects(ctx, rows))
      let actors = dict.from_list(actors)
      let shouts = dict.from_list(shout_rows)
      list.map(rows, fn(n) {
        models.NotificationView(
          id: n.id,
          type_: n.type_,
          read: n.read,
          created_at: row.iso8601(n.created_at),
          subject_uri: n.subject_uri,
          shout_id: n.shout_id,
          shout_content: option.then(n.shout_id, fn(id) {
            dict.get(shouts, id) |> option.from_result
          }),
          actor: dict.get(actors, n.actor_id) |> option.from_result,
          subject: option.then(n.subject_uri, fn(uri) {
            dict.get(subject_map, uri) |> option.from_result
          }),
        )
      })
    }
  }
}
