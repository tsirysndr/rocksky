import gleam/list
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  all, all_columns, and, desc, eq, eq_columns, inner_join, limit, nested, offset,
  or, order_by, pair, select, where,
}
import rocksky_api/drizzle/schema/event_rsvps as er
import rocksky_api/drizzle/schema/events as e
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/event_view
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/task
import rocksky_api/views/event
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(server, "app.rocksky.event.getEventRsvps", None, fn(req) {
    use params <- handler.query(
      req,
      handler.options("getEventRsvps")
        |> handler.no_retry
        |> handler.on_error(handler.Propagate),
      models.get_event_rsvps_params_decoder(),
    )
    use found <- task.then(event_view.find(ctx, params.uri))
    case found {
      None -> task.fail(error.RequestError("NotFound", "Event not found"))
      Some(row) -> {
        let events = e.table()
        let users = u.table()
        let rsvps = er.table()
        let condition =
          or([
            eq(e.id(events), row.0.id),
            eq(e.duplicate_of(events), Some(row.0.id)),
          ])
        use rows <- task.map(
          select(
            rsvps,
            pair(
              nested("rsvp", all_columns(rsvps)),
              nested("user", all_columns(users)),
            ),
          )
          |> inner_join(users, eq_columns(er.user_id(rsvps), u.id(users)))
          |> inner_join(events, eq_columns(er.event_id(rsvps), e.id(events)))
          |> where(
            and([
              condition,
              ..case params.status {
                None | Some("") -> []
                Some(status) -> [eq(er.status(rsvps), status)]
              }
            ]),
          )
          |> order_by([desc(er.updated_at(rsvps)), desc(er.id(rsvps))])
          |> limit(option.unwrap(params.limit, 50))
          |> offset(option.unwrap(params.offset, 0))
          |> all(ctx.db),
        )
        models.GetEventRsvpsOutput(
          list.map(rows, fn(r) { event.rsvp(r.0, r.1) }),
        )
        |> models.encode_get_event_rsvps_output
      }
    }
  })
}
