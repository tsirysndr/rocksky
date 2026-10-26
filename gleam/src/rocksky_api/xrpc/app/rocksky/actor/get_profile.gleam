import gleam/json
import gleam/option.{None, Some}
import gleam/string
import gleam/time/timestamp
import rocksky_api/atproto/agent as atp
import rocksky_api/atproto/identity
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all_columns, eq, eq_columns, field, left_join, nested, nullable, one,
  optional_selection, pair, returning_one, select, set, update, where,
}
import rocksky_api/drizzle/schema/spotify_accounts as sa
import rocksky_api/drizzle/schema/spotify_tokens as st
import rocksky_api/drizzle/schema/users as u
import rocksky_api/error
import rocksky_api/lexicon/models
import rocksky_api/lib/agent
import rocksky_api/lib/bsky_profile
import rocksky_api/lib/id_resolver
import rocksky_api/lib/profile_user
import rocksky_api/node/js
import rocksky_api/node/nats
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/users.{type User}
import rocksky_api/task
import rocksky_api/views/profile
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.actor.getProfile",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("getProfile") |> handler.timeout(120_000),
        models.get_profile_params_decoder(),
      )
      use view <- task.map(retrieve(ctx, params.did, handler.caller(req)))
      profile.encode_detailed(view)
    },
  )
}

fn retrieve(ctx: Context, requested, caller) {
  use did <- task.then(case requested {
    Some(value) if value != "" ->
      case
        string.starts_with(value, "did:plc:")
        || string.starts_with(value, "did:web:")
      {
        True -> task.ok(value)
        False -> {
          use resolved <- task.then(
            task.attempt_result(identity.resolve_handle(ctx.resolver, value)),
          )
          case resolved {
            Some(did) -> task.ok(did)
            None ->
              task.fail(error.Message(
                "handle " <> value <> " does not resolve to a DID",
              ))
          }
        }
      }
    _ ->
      case caller {
        Some(did) if did != "" -> task.ok(did)
        _ ->
          task.fail(error.Message(
            "request carried neither an actor nor an authenticated session",
          ))
      }
  })
  let users = u.table()
  let spotify = sa.table()
  let tokens = st.table()
  // Public profile and identity work can run while the account row is read.
  // The optional Spotify joins preserve users without either account record.
  use gathered <- task.then(task.all2(
    select(
      users,
      pair(
        nested("user", all_columns(users)),
        pair(
          nested("spotify", all_columns(spotify)) |> optional_selection,
          field("tokenId", nullable(st.id(tokens))),
        ),
      ),
    )
      |> left_join(spotify, eq_columns(sa.user_id(spotify), u.id(users)))
      |> left_join(tokens, eq_columns(st.user_id(tokens), u.id(users)))
      |> where(eq(u.did(users), did))
      |> one(ctx.db),
    task.all2(
      id_resolver.resolve_did_to_handle(ctx.resolver, did),
      bsky_profile.fetch_with_fallback(ctx.env.bsky_appview_url, did, fn() {
        case requested {
          None | Some("") -> agent.create(ctx, did)
          _ -> {
            use data <- task.map(
              task.attempt_result(identity.resolve_atproto_data(
                ctx.resolver,
                did,
              )),
            )
            Some(atp.atp_agent(data.pds))
          }
        }
      }),
    ),
  ))
  let existing = option.map(gathered.0, fn(r) { r.0 })
  let spotify = option.then(gathered.0, fn(r) { r.1.0 })
  let connected = option.then(gathered.0, fn(r) { r.1.1 }) != None
  use user <- task.map(refresh(ctx, did, gathered.1.0, gathered.1.1, existing))
  profile.Detailed(user, spotify, connected)
}

pub fn refresh(
  ctx: Context,
  did: String,
  handle: String,
  fetched: bsky_profile.Profile,
  existing: option.Option(User),
) {
  let users = u.table()
  let now =
    timestamp.from_unix_seconds_and_nanoseconds(
      js.now_ms() / 1000,
      js.now_ms() % 1000 * 1_000_000,
    )
  use result <- task.then(case existing {
    None ->
      profile_user.save(ctx.db, did, handle, fetched)
      |> task.map(fn(user) { #(Some(user), True, 1) })
    Some(user) -> {
      let avatar = option.unwrap(fetched.avatar, user.avatar)
      let name = option.or(fetched.display_name, user.display_name)
      case
        user.handle == handle
        && user.avatar == avatar
        && user.display_name == name
      {
        True -> task.ok(#(Some(user), False, 0))
        False ->
          update(
            users,
            [
              set(u.handle(users), handle),
              set(u.avatar(users), avatar),
              set(u.display_name(users), name),
              set(u.updated_at(users), now),
            ],
            eq(u.id(users), user.id),
          )
          |> returning_one(ctx.db, "Failed to refresh profile")
          |> task.map(fn(updated) {
            #(Some(updated), True, case option.unwrap(user.xata_version, 1) {
              0 -> 2
              n -> n + 1
            })
          })
      }
    }
  })
  case result.0 {
    None -> task.fail(error.Message("Failed to refresh profile"))
    Some(user) -> {
      case result.1 {
        True -> publish(ctx, user, result.2)
        False -> Nil
      }
      task.ok(user)
    }
  }
}

fn publish(ctx: Context, user: User, version: Int) {
  let message =
    json.object([
      #("xata_id", json.string(user.id)),
      #("did", json.string(user.did)),
      #("handle", json.string(user.handle)),
      #("display_name", json.nullable(user.display_name, json.string)),
      #("avatar", json.string(user.avatar)),
      #("xata_createdat", json.string(row.iso8601(user.created_at))),
      #("xata_updatedat", json.string(row.iso8601(user.updated_at))),
      #("xata_version", json.int(version)),
    ])
  nats.publish(ctx.nc, "rocksky.user", json.to_string(message))
}
