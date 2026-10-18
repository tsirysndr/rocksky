import gleam/dict
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  alias, all, all_columns, and, asc, count, desc, eq, eq_columns, field,
  group_by, in_array, left_join, nested, nullable, one, or, order_by, pair,
  reference, select, where,
}
import rocksky_api/drizzle/schema/albums as al
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/profile_shouts as ps
import rocksky_api/drizzle/schema/scrobbles as sc
import rocksky_api/drizzle/schema/shout_likes as sl
import rocksky_api/drizzle/schema/shout_reports as sr
import rocksky_api/drizzle/schema/shouts as s
import rocksky_api/drizzle/schema/tracks as t
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/schema/shouts.{type Shout}
import rocksky_api/schema/users.{type User}
import rocksky_api/task

pub type Subject {
  Album
  Artist
  Track
  Profile
  Replies
  Scrobble
}

pub type View {
  View(
    shout: Shout,
    author: User,
    likes: Option(Int),
    liked: Option(Bool),
    reported: Option(Bool),
  )
}

pub fn retrieve(ctx: Context, subject: Subject, identifier: String, caller) {
  retrieve_with_viewer(ctx, subject, identifier, caller, True)
}

pub fn retrieve_for_viewer(
  ctx: Context,
  subject: Subject,
  identifier: String,
  caller,
) {
  retrieve_with_viewer(ctx, subject, identifier, caller, False)
}

fn retrieve_with_viewer(
  ctx: Context,
  subject: Subject,
  identifier: String,
  caller,
  legacy: Bool,
) {
  let shouts = s.table()
  let users = u.table()
  let authors = alias(users, "authors")
  let albums = al.table()
  let artists = a.table()
  let tracks = t.table()
  let profiles = ps.table()
  // These two legacy endpoints use the subject profile and the literal "did",
  // respectively, rather than the caller when computing viewer flags.
  let lookup = case subject, legacy {
    Profile, True ->
      or([eq(u.did(users), identifier), eq(u.handle(users), identifier)])
    Track, True -> eq(u.did(users), "did")
    _, _ -> eq(nullable(u.did(users)), caller)
  }
  use viewer <- task.then(case subject {
    Replies -> task.ok(None)
    _ -> select(users, field("id", u.id(users))) |> where(lookup) |> one(ctx.db)
  })
  let projection =
    pair(
      nested("shout", all_columns(shouts)),
      nested("author", all_columns(authors)),
    )
  let base =
    select(shouts, projection)
    |> left_join(authors, eq_columns(s.author_id(shouts), u.id(authors)))
  let query = case subject {
    Scrobble -> {
      let scrobbles = sc.table()
      base
      |> left_join(
        scrobbles,
        eq_columns(s.scrobble_id(shouts), nullable(sc.id(scrobbles))),
      )
      |> where(eq(sc.uri(scrobbles), Some(identifier)))
    }
    Album ->
      base
      |> left_join(
        albums,
        eq_columns(s.album_id(shouts), nullable(al.id(albums))),
      )
      |> where(eq(al.uri(albums), Some(identifier)))
    Artist ->
      base
      |> left_join(
        artists,
        eq_columns(s.artist_id(shouts), nullable(a.id(artists))),
      )
      |> where(eq(a.uri(artists), Some(identifier)))
    Track ->
      base
      |> left_join(
        tracks,
        eq_columns(s.track_id(shouts), nullable(t.id(tracks))),
      )
      |> where(eq(t.uri(tracks), Some(identifier)))
    Profile ->
      select(profiles, projection)
      |> left_join(shouts, eq_columns(ps.shout_id(profiles), s.id(shouts)))
      |> left_join(authors, eq_columns(s.author_id(shouts), u.id(authors)))
      |> left_join(users, eq_columns(ps.user_id(profiles), u.id(users)))
      |> where(
        or([eq(u.did(users), identifier), eq(u.handle(users), identifier)]),
      )
    Replies -> base |> where(eq(s.parent_id(shouts), Some(identifier)))
  }
  let ordering = case subject {
    Profile -> desc(ps.created_at(profiles))
    Replies -> asc(s.created_at(shouts))
    _ -> desc(s.created_at(shouts))
  }
  use rows <- task.then(query |> order_by([ordering]) |> all(ctx.db))
  case rows, subject {
    [], _ -> task.ok([])
    _, Replies ->
      task.ok(list.map(rows, fn(r) { View(r.0, r.1, None, None, None) }))
    _, _ -> {
      let ids = list.map(rows, fn(r) { r.0.id })
      let likes = sl.table()
      let reports = sr.table()
      use data <- task.map(
        task.all3(
          select(
            likes,
            pair(field("id", sl.shout_id(likes)), field("count", count())),
          )
            |> where(in_array(sl.shout_id(likes), ids))
            |> group_by([reference(sl.shout_id(likes))])
            |> all(ctx.db),
          case viewer {
            None -> task.ok([])
            Some(id) ->
              select(likes, field("id", sl.shout_id(likes)))
              |> where(
                and([
                  in_array(sl.shout_id(likes), ids),
                  eq(sl.user_id(likes), id),
                ]),
              )
              |> all(ctx.db)
          },
          case viewer, subject {
            Some(id), Profile ->
              select(reports, field("id", sr.shout_id(reports)))
              |> where(
                and([
                  in_array(sr.shout_id(reports), ids),
                  eq(sr.user_id(reports), id),
                ]),
              )
              |> all(ctx.db)
            _, _ -> task.ok([])
          },
        ),
      )
      let counts = dict.from_list(data.0)
      list.map(rows, fn(r) {
        View(
          r.0,
          r.1,
          Some(dict.get(counts, r.0.id) |> result.unwrap(0)),
          option.map(viewer, fn(_) { list.contains(data.1, r.0.id) }),
          case subject {
            Profile ->
              option.map(viewer, fn(_) { list.contains(data.2, r.0.id) })
            _ -> None
          },
        )
      })
    }
  }
}

pub fn encode(views: List(View)) {
  json.object([
    #(
      "shouts",
      json.array(views, fn(view) {
        json.object([
          #("id", json.string(view.shout.id)),
          #("content", json.string(view.shout.content)),
          #("uri", json.string(view.shout.uri)),
          #("createdAt", json.string(row.iso8601(view.shout.created_at))),
          #("parent", json.nullable(view.shout.parent_id, json.string)),
          #(
            "author",
            models.encode_shout_author(models.ShoutAuthor(
              Some(view.author.id),
              Some(view.author.did),
              Some(view.author.handle),
              Some(view.author.display_name),
              Some(view.author.avatar),
            )),
          ),
          ..list.flatten([
            case view.likes {
              None -> []
              Some(v) -> [#("likes", json.int(v))]
            },
            case view.liked {
              None -> []
              Some(v) -> [#("liked", json.bool(v))]
            },
            case view.reported {
              None -> []
              Some(v) -> [#("reported", json.bool(v))]
            },
          ])
        ])
      }),
    ),
  ])
}
