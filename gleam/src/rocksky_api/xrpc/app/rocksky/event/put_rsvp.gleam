import gleam/json
import gleam/list
import gleam/option.{None, Some}
import gleam/string
import gleam/time/timestamp
import rocksky_api/atproto/agent as atp
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  advisory_xact_lock, all_columns, and, conflict_target, desc, eq, eq_columns,
  from, inner_join, insert, nested, on_conflict_update, one, or, order_by, pair,
  run, select, set, transaction, where,
}
import rocksky_api/drizzle/schema/event_rsvps as er
import rocksky_api/drizzle/schema/events as e
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/event_view
import rocksky_api/node/js
import rocksky_api/node/tid
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

const collection = "community.lexicon.calendar.rsvp"

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.event.putRsvp",
    Some(auth.verifier(ctx)),
    fn(req) {
      use input <- handler.procedure_body(
        req,
        handler.options("putRsvp")
          |> handler.no_retry
          |> handler.on_error(handler.Propagate),
        models.put_rsvp_input_decoder(),
      )
      use output <- task.map(put(ctx, input, handler.caller(req), agent.create))
      models.encode_put_rsvp_output(output)
    },
  )
}

pub fn put(ctx: Context, input: models.PutRsvpInput, viewer, factory) {
  use did <- task.then(case viewer {
    None | Some("") -> task.fail(error.Unauthorized("Sign in to RSVP."))
    Some(did) -> task.ok(did)
  })
  use _ <- task.then(
    case
      list.contains(
        [event_view.going, event_view.interested, event_view.not_going],
        input.status,
      )
    {
      False -> task.fail(error.InvalidRequest("Invalid RSVP status"))
      True -> task.ok(Nil)
    },
  )
  use found <- task.then(event_view.find(ctx, input.uri))
  use event <- task.then(case found {
    None -> task.fail(error.RequestError("NotFound", "Event not found"))
    Some(row) -> task.ok(row.0)
  })
  let users = u.table()
  use user <- task.then(
    from(users) |> where(eq(u.did(users), did)) |> one(ctx.db),
  )
  use user <- task.then(case user {
    None -> task.fail(error.Unauthorized("Sign in to RSVP."))
    Some(user) -> task.ok(user)
  })
  use agent <- task.then(factory(ctx, did))
  use agent <- task.then(case agent {
    None -> task.fail(error.Unauthorized("Sign in again to RSVP."))
    Some(agent) -> task.ok(agent)
  })
  use tx <- transaction(ctx.db)
  use _ <- task.then(advisory_xact_lock(tx, did <> ":" <> event.id))
  let events = e.table()
  let rsvps = er.table()
  use existing <- task.then(
    select(
      rsvps,
      pair(
        nested("rsvp", all_columns(rsvps)),
        nested("event", all_columns(events)),
      ),
    )
    |> inner_join(events, eq_columns(er.event_id(rsvps), e.id(events)))
    |> where(
      and([
        eq(er.user_id(rsvps), user.id),
        or([
          eq(e.id(events), event.id),
          eq(e.duplicate_of(events), Some(event.id)),
        ]),
      ]),
    )
    |> order_by([desc(er.updated_at(rsvps))])
    |> one(tx),
  )
  let #(subject, rkey) = case existing {
    None -> #(event, tid.next())
    Some(row) -> #(row.1, atp.rkey_of(row.0.uri))
  }
  use cid <- task.then(case subject.cid {
    Some(cid) if cid != "" -> task.ok(Some(cid))
    _ ->
      case string.split(string.replace(subject.uri, "at://", ""), "/") {
        [repo, collection, key, ..] ->
          task.attempt_result(atp.get_record(agent, repo, collection, key))
          |> task.map(fn(record) { record.cid })
        _ -> task.ok(None)
      }
  })
  use cid <- task.then(case cid {
    None | Some("") ->
      task.fail(error.InvalidRequest("Event record is unavailable"))
    Some(cid) -> task.ok(cid)
  })
  let record =
    json.object([
      #("$type", json.string(collection)),
      #(
        "subject",
        json.object([
          #("uri", json.string(subject.uri)),
          #("cid", json.string(cid)),
        ]),
      ),
      #("status", json.string(input.status)),
    ])
  use ref <- task.then(
    task.attempt_result(atp.put_record_unchecked(
      agent,
      did,
      collection,
      rkey,
      record,
      None,
    ))
    |> task.map_error(fn(err) {
      case err {
        error.Js(exception) ->
          case js.status(exception) {
            Some(401) | Some(403) ->
              error.Unauthorized("Sign in again to grant RSVP access.")
            _ -> err
          }
        _ -> err
      }
    }),
  )
  let changes = [
    set(er.uri(rsvps), ref.uri),
    set(er.cid(rsvps), Some(ref.cid)),
    set(er.status(rsvps), input.status),
  ]
  use _ <- task.map(
    insert(rsvps, [
      set(er.event_id(rsvps), subject.id),
      set(er.user_id(rsvps), user.id),
      ..changes
    ])
    |> on_conflict_update(
      [conflict_target(er.event_id(rsvps)), conflict_target(er.user_id(rsvps))],
      [
        set(
          er.updated_at(rsvps),
          timestamp.from_unix_seconds(js.now_ms() / 1000),
        ),
        ..changes
      ],
    )
    |> run(tx),
  )
  models.PutRsvpOutput(ref.uri, input.status)
}
