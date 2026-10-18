import gleam/json
import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all, all_columns, desc, eq, eq_columns, field, left_join, nested, or, order_by,
  pair, select, where,
}
import rocksky_api/drizzle/schema/profile_shouts as ps
import rocksky_api/drizzle/schema/shout_likes as sl
import rocksky_api/drizzle/schema/shouts as sh
import rocksky_api/drizzle/schema/users as us
import rocksky_api/lib/auth
import rocksky_api/lib/respond
import rocksky_api/lib/shout_queries as queries
import rocksky_api/node/hono
import rocksky_api/schema/shout_likes
import rocksky_api/schema/shouts
import rocksky_api/schema/users
import rocksky_api/task
import rocksky_api/users/json_object

fn uri(c: hono.Context, kind: String) {
  "at://"
  <> hono.param(c, "did")
  <> "/app.rocksky."
  <> kind
  <> "/"
  <> hono.param(c, "rkey")
}

fn encode(view: queries.View) {
  let shout = view.shout
  json.object([
    #(
      "shouts",
      json.object([
        #("id", json.string(shout.id)),
        #("content", json.string(shout.content)),
        #("createdAt", json.string(row.iso8601(shout.created_at))),
        #("uri", json.string(shout.uri)),
        #("parent", json.nullable(shout.parent_id, json.string)),
        #("gifUrl", json.nullable(shout.gif_url, json.string)),
        #("gifPreviewUrl", json.nullable(shout.gif_preview_url, json.string)),
        #("gifAlt", json.nullable(shout.gif_alt, json.string)),
        #("gifWidth", json.nullable(shout.gif_width, json.int)),
        #("gifHeight", json.nullable(shout.gif_height, json.int)),
        #("facets", json.nullable(shout.facets, row.dynamic_to_json)),
        ..list.flatten([
          case view.likes {
            None -> []
            Some(n) -> [#("likes", json.int(n))]
          },
          case view.liked {
            None -> []
            Some(b) -> [#("liked", json.bool(b))]
          },
          case view.reported {
            None -> []
            Some(b) -> [#("reported", json.bool(b))]
          },
        ])
      ]),
    ),
    #(
      "users",
      json.object([
        #("id", json.string(view.author.id)),
        #("did", json.string(view.author.did)),
        #("handle", json.string(view.author.handle)),
        #("displayName", json.string(view.author.display_name)),
        #("avatar", json.string(view.author.avatar)),
      ]),
    ),
  ])
}

fn retrieve(
  ctx: Context,
  c: hono.Context,
  subject: queries.Subject,
  kind: String,
) {
  let work = {
    use did <- task.then(auth.optional_did(ctx, c))
    let identifier = case subject {
      queries.Profile -> hono.param(c, "did")
      _ -> uri(c, kind)
    }
    use views <- task.then(queries.retrieve_for_viewer(
      ctx,
      subject,
      identifier,
      did,
    ))
    case subject {
      queries.Profile -> {
        let profiles = ps.table()
        let users = us.table()
        use links <- task.map(
          select(
            profiles,
            pair(
              field("id", ps.id(profiles)),
              field("created", ps.created_at(profiles)),
            ),
          )
          |> left_join(users, eq_columns(ps.user_id(profiles), us.id(users)))
          |> where(
            or([eq(us.did(users), identifier), eq(us.handle(users), identifier)]),
          )
          |> order_by([desc(ps.created_at(profiles))])
          |> all(ctx.db),
        )
        json.array(list.zip(views, links), fn(v) {
          json_object.extend(encode(v.0), [
            #(
              "profileShouts",
              json.object([
                #("id", json.string(v.1.0)),
                #("createdAt", json.string(row.iso8601(v.1.1))),
              ]),
            ),
          ])
        })
      }
      _ -> task.ok(json.array(views, encode))
    }
  }
  respond.json(c, work)
}

pub fn routes(app: hono.App, ctx: Context) {
  app
  |> hono.get("/:did/app.rocksky.artist/:rkey/shouts", retrieve(
    ctx,
    _,
    queries.Artist,
    "artist",
  ))
  |> hono.get("/:did/app.rocksky.album/:rkey/shouts", retrieve(
    ctx,
    _,
    queries.Album,
    "album",
  ))
  |> hono.get("/:did/app.rocksky.song/:rkey/shouts", retrieve(
    ctx,
    _,
    queries.Track,
    "song",
  ))
  |> hono.get("/:did/app.rocksky.scrobble/:rkey/shouts", retrieve(
    ctx,
    _,
    queries.Scrobble,
    "scrobble",
  ))
  |> hono.get("/:did/shouts", retrieve(ctx, _, queries.Profile, "profile"))
  |> hono.get("/:did/app.rocksky.shout/:rkey/replies", fn(c) {
    respond.json(
      c,
      queries.retrieve_for_viewer(ctx, queries.Replies, uri(c, "shout"), None)
        |> task.map(fn(rows) {
          json.array(rows, fn(r) {
            json.object([
              #("shouts", shouts.to_json(r.shout)),
              #("users", users.to_json(r.author)),
            ])
          })
        }),
    )
  })
  |> hono.get("/:did/app.rocksky.shout/:rkey/likes", fn(c) {
    let likes = sl.table()
    let shouts = sh.table()
    let users = us.table()
    let work =
      select(
        likes,
        pair(
          nested("likes", all_columns(likes)),
          pair(
            nested("shout", all_columns(shouts)),
            nested("user", all_columns(users)),
          ),
        ),
      )
      |> left_join(users, eq_columns(sl.user_id(likes), us.id(users)))
      |> left_join(shouts, eq_columns(sl.shout_id(likes), sh.id(shouts)))
      |> where(eq(sh.uri(shouts), uri(c, "shout")))
      |> all(ctx.db)
      |> task.map(fn(rows) {
        json.array(rows, fn(r) {
          json.object([
            #("shout_likes", shout_likes.to_json(r.0)),
            #("shouts", shouts.to_json(r.1.0)),
            #("users", users.to_json(r.1.1)),
          ])
        })
      })
    respond.json(c, work)
  })
}
