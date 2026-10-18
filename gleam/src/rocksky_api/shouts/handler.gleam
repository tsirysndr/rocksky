import gleam/dynamic/decode
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/agent
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/shouts/input
import rocksky_api/shouts/service
import rocksky_api/task
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

pub type Operation {
  Create
  Reply
  Like
  Unlike
  Remove
}

pub fn register(
  server: Server,
  ctx: Context,
  name: String,
  operation: Operation,
) {
  xrpc_server.method(server, name, Some(auth.verifier(ctx)), fn(req) {
    let timeout = case operation {
      Like | Unlike -> 10_000
      _ -> 15_000
    }
    use <- handler.run(
      handler.options(name) |> handler.timeout(timeout) |> handler.no_retry,
    )
    use did <- task.then(task.from_result(handler.authenticated(req)))
    let body = case operation {
      Remove -> Ok(req.params)
      _ -> task.require(req.input, "Missing body")
    }
    use body <- task.then(task.from_result(body))
    let key = case operation {
      Reply -> "shoutId"
      Remove -> "id"
      _ -> "uri"
    }
    use uri <- task.then(
      decode.run(body, decode.at([key], decode.string))
      |> error.decode(key, _)
      |> task.from_result,
    )
    use user <- task.then(service.user(ctx, did))
    use agent <- task.then(agent.require(ctx, did))
    use _ <- task.map(case operation {
      Create | Reply -> {
        use input <- task.then(
          decode.run(body, input.decoder())
          |> error.decode("shout", _)
          |> task.from_result,
        )
        case operation {
          Create -> service.create(ctx, input, uri, user, agent)
          _ -> service.reply(ctx, input, uri, user, agent)
        }
      }
      Like -> service.like(ctx, uri, user, agent)
      Unlike -> service.unlike(ctx, uri, user, agent)
      Remove -> service.remove(ctx, uri, user, agent)
    })
    json.object([])
  })
}
