import gleam/dynamic/decode
import gleam/json
import gleam/option.{None, Some}
import gleam/string
import gleam/time/timestamp
import rocksky_api/atproto/agent as atp
import rocksky_api/atproto/identity
import rocksky_api/context.{type Context}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  all_columns, eq, eq_columns, field, from, inner_join, one, returning_one,
  select, set, update, where,
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
import rocksky_api/node/axios
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
  use endpoint <- task.then(case requested {
    None | Some("") -> task.ok(None)
    _ -> {
      let url = case string.starts_with(did, "did:plc:") {
        True -> ctx.env.plc_directory_url <> "/" <> did
        False ->
          "https://" <> string.drop_start(did, 8) <> "/.well-known/did.json"
      }
      use response <- task.map(
        task.attempt_result(axios.get(
          axios.global(),
          url,
          axios.default_options(),
        )),
      )
      decode.run(
        response.data,
        decode.at(
          ["service"],
          decode.list(decode.field(
            "serviceEndpoint",
            decode.string,
            decode.success,
          )),
        ),
      )
      |> option.from_result
      |> option.then(fn(services) {
        case services {
          [first, ..] -> Some(first)
          [] -> None
        }
      })
    }
  })
  use agent <- task.then(case endpoint {
    Some(endpoint) -> task.ok(Some(atp.atp_agent(endpoint)))
    None -> agent.create(ctx, did) |> task.rescue(fn(_) { task.ok(None) })
  })
  let users = u.table()
  use existing <- task.then(
    from(users) |> where(eq(u.did(users), did)) |> one(ctx.db),
  )
  use resolved <- task.then(bsky_profile.fetch(
    ctx.env.bsky_appview_url,
    did,
    agent,
  ))
  use handle <- task.then(id_resolver.resolve_did_to_handle(ctx.resolver, did))
  let spotify = sa.table()
  let tokens = st.table()
  use accounts <- task.then(task.all2(
    select(spotify, all_columns(spotify))
      |> inner_join(users, eq_columns(sa.user_id(spotify), u.id(users)))
      |> where(eq(u.did(users), did))
      |> one(ctx.db),
    select(tokens, field("id", st.id(tokens)))
      |> inner_join(users, eq_columns(st.user_id(tokens), u.id(users)))
      |> where(eq(u.did(users), did))
      |> one(ctx.db),
  ))
  use user <- task.map(refresh(ctx, did, handle, resolved, existing))
  profile.Detailed(user, accounts.0, accounts.1 != None)
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
