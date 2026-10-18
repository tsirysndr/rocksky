import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/time/timestamp
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  alias, all, all_columns, and, asc, coalesce, coalesce_optional, count, eq,
  eq_columns, equals_case_insensitive, exists, field, group_by, gte, in_array,
  inner_join, is_null, left_join, limit, lte, nested, offset, one,
  optional_selection, or, order_by, order_nulls_last, pair, reference, select,
  where,
}
import rocksky_api/drizzle/schema/artists as a
import rocksky_api/drizzle/schema/event_artists as ea
import rocksky_api/drizzle/schema/event_rsvps as er
import rocksky_api/drizzle/schema/events as e
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/node/js
import rocksky_api/node/rsql_parser
import rocksky_api/schema/events.{type Event}
import rocksky_api/schema/users.{type User}
import rocksky_api/task
import rocksky_api/views/event
import rocksky_api/xrpc/app/rocksky/playlist/get_playlist

pub const going = "community.lexicon.calendar.rsvp#going"

pub const interested = "community.lexicon.calendar.rsvp#interested"

pub const not_going = "community.lexicon.calendar.rsvp#notgoing"

pub fn query() {
  let events = e.table()
  let users = u.table()
  select(
    events,
    pair(
      nested("event", all_columns(events)),
      nested("user", all_columns(users)),
    ),
  )
  |> inner_join(users, eq_columns(e.created_by(events), u.id(users)))
}

pub fn find(ctx: Context, uri: String) {
  use uri <- task.then(get_playlist.canonical_uri(ctx, uri))
  let events = e.table()
  use found <- task.then(
    query()
    |> where(or([eq(e.uri(events), uri), eq(e.music_uri(events), uri)]))
    |> one(ctx.db),
  )
  case found {
    None -> task.ok(None)
    Some(row) ->
      case row.0.duplicate_of {
        None -> task.ok(found)
        Some(id) ->
          query()
          |> where(eq(e.id(events), id))
          |> one(ctx.db)
          |> task.map(option.or(_, found))
      }
  }
}

pub fn hydrate(
  ctx: Context,
  rows: List(#(Event, User)),
  viewer: Option(String),
) {
  case rows {
    [] -> task.ok([])
    _ -> {
      let ids = list.map(rows, fn(r) { r.0.id })
      let events = e.table()
      let artists = a.table()
      let entries = ea.table()
      let rsvps = er.table()
      let users = u.table()
      let group = coalesce(e.duplicate_of(events), e.id(events))
      use data <- task.map(
        task.all3(
          select(
            entries,
            pair(
              nested("entry", all_columns(entries)),
              nested("artist", optional_selection(all_columns(artists))),
            ),
          )
            |> left_join(
              artists,
              eq_columns(ea.artist_id(entries), a.id(artists)),
            )
            |> where(in_array(ea.event_id(entries), ids))
            |> order_by([asc(ea.position(entries))])
            |> all(ctx.db),
          select(
            rsvps,
            pair(
              pair(field("event", group), field("status", er.status(rsvps))),
              field("count", count()),
            ),
          )
            |> inner_join(events, eq_columns(er.event_id(rsvps), e.id(events)))
            |> where(in_array(group, ids))
            |> group_by([reference(group), reference(er.status(rsvps))])
            |> all(ctx.db),
          case viewer {
            None -> task.ok([])
            Some(did) ->
              select(
                rsvps,
                pair(field("event", group), field("status", er.status(rsvps))),
              )
              |> inner_join(
                events,
                eq_columns(er.event_id(rsvps), e.id(events)),
              )
              |> inner_join(users, eq_columns(er.user_id(rsvps), u.id(users)))
              |> where(and([in_array(group, ids), eq(u.did(users), did)]))
              |> all(ctx.db)
          },
        ),
      )
      list.map(rows, fn(row) {
        let lineup =
          data.0
          |> list.filter(fn(r) { r.0.event_id == row.0.id })
          |> list.map(fn(r) { event.artist(r.0, r.1) })
        let counts =
          data.1
          |> list.filter(fn(r) { r.0.0 == row.0.id })
          |> list.fold(models.EventRsvpCounts(0, 0, 0), fn(c, r) {
            case r.0.1 {
              status if status == going ->
                models.EventRsvpCounts(..c, going: c.going + r.1)
              status if status == interested ->
                models.EventRsvpCounts(..c, interested: c.interested + r.1)
              status if status == not_going ->
                models.EventRsvpCounts(..c, not_going: c.not_going + r.1)
              _ -> c
            }
          })
        let own =
          data.2
          |> list.reverse
          |> list.find(fn(r) { r.0 == row.0.id })
          |> result.map(fn(r) { r.1 })
          |> option.from_result
        event.view(row.0, row.1, lineup, counts, own)
      })
    }
  }
}

fn parse_date(value, name) {
  case value {
    None -> task.ok(None)
    Some(value) -> {
      let parsed =
        rsql_parser.date(value)
        |> result.try(fn(raw) {
          decode.run(raw, row.timestamp())
          |> result.replace_error("Invalid datetime")
        })
      task.from_result(
        parsed
        |> result.map(Some)
        |> result.replace_error(error.InvalidRequest(
          "`" <> name <> "` is not a valid datetime",
        )),
      )
    }
  }
}

pub fn list_events(ctx: Context, filters: models.GetEventsParams, viewer) {
  use from <- task.then(parse_date(filters.from, "from"))
  use to <- task.then(parse_date(filters.to, "to"))
  let past = option.unwrap(filters.include_past, False)
  let lower = case from, to, past {
    None, None, False ->
      Some(timestamp.from_unix_seconds(js.now_ms() / 86_400_000 * 86_400))
    _, _, _ -> from
  }
  let events = e.table()
  let users = u.table()
  let entries = ea.table()
  let artists = a.table()
  let rsvps = er.table()
  let attended = alias(events, "attended")
  let attendee = alias(users, "attendee")
  let conditions =
    [
      Some(is_null(e.duplicate_of(events))),
      option.map(lower, fn(bound) {
        or([
          is_null(e.starts_at(events)),
          gte(
            coalesce_optional(e.ends_at(events), e.starts_at(events)),
            Some(bound),
          ),
        ])
      }),
      option.map(to, fn(bound) { lte(e.starts_at(events), Some(bound)) }),
      option.map(filters.did |> option.then(event.nonempty), fn(did) {
        eq(u.did(users), did)
      }),
      option.map(filters.kind |> option.then(event.nonempty), fn(kind) {
        eq(e.kind(events), Some(kind))
      }),
      option.map(filters.genre |> option.then(event.nonempty), fn(genre) {
        equals_case_insensitive(e.genre(events), genre)
      }),
      option.map(filters.artist |> option.then(event.nonempty), fn(artist) {
        select(entries, field("id", ea.id(entries)))
        |> inner_join(artists, eq_columns(ea.artist_id(entries), a.id(artists)))
        |> where(
          and([
            eq_columns(ea.event_id(entries), e.id(events)),
            or([
              eq(a.uri(artists), Some(artist)),
              eq(a.id(artists), artist),
              eq(a.sha256(artists), artist),
            ]),
          ]),
        )
        |> exists
      }),
      option.map(filters.rsvp_by |> option.then(event.nonempty), fn(did) {
        select(rsvps, field("id", er.id(rsvps)))
        |> inner_join(attended, eq_columns(er.event_id(rsvps), e.id(attended)))
        |> inner_join(attendee, eq_columns(er.user_id(rsvps), u.id(attendee)))
        |> where(
          and([
            eq_columns(
              coalesce(e.duplicate_of(attended), e.id(attended)),
              e.id(events),
            ),
            eq(u.did(attendee), did),
            in_array(er.status(rsvps), [going, interested]),
          ]),
        )
        |> exists
      }),
    ]
    |> list.filter_map(option.to_result(_, Nil))
  use rows <- task.then(
    query()
    |> where(and(conditions))
    |> order_by([
      order_nulls_last(e.starts_at(events), past && from == None),
      asc(e.id(events)),
    ])
    |> limit(option.unwrap(filters.limit, 20))
    |> offset(option.unwrap(filters.offset, 0))
    |> all(ctx.db),
  )
  hydrate(ctx, rows, viewer)
}
