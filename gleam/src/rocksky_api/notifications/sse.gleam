import gleam/javascript/promise
import gleam/json
import gleam/option.{Some}
import rocksky_api/context.{type Context}
import rocksky_api/lib/auth
import rocksky_api/lib/verify_token
import rocksky_api/node/hono
import rocksky_api/node/map
import rocksky_api/node/nats
import rocksky_api/notifications/service
import rocksky_api/task

pub fn app(ctx: Context) {
  hono.new()
  |> hono.get("/stream", fn(c) {
    let authenticate = {
      use token <- task.then(
        task.require(hono.query(c, "token"), "Unauthorized") |> task.from_result,
      )
      use did <- task.then(verify_token.verify_did(ctx.env, ctx.db, token))
      auth.require_user(ctx, did)
    }
    use result <- promise.map(authenticate)
    case result {
      Error(_) -> hono.unauthorized(c)
      Ok(user) ->
        hono.stream_sse(c, fn(stream) {
          let subscription =
            nats.subscribe_raw(ctx.nc, service.subject(user.id))
          let state = map.new()
          let closed = fn() { option.unwrap(map.get(state, "closed"), False) }
          let close = fn() {
            case closed() {
              True -> Nil
              False -> {
                map.set(state, "closed", True)
                nats.unsubscribe(subscription)
              }
            }
          }
          hono.on_abort(stream, close)
          use _ <- promise.await({
            use count <- task.then(service.unread_count(ctx, user.id))
            hono.write_sse(
              stream,
              "unread",
              json.object([#("unreadCount", json.int(count))]) |> json.to_string,
            )
            |> task.attempt_result
          })
          let heartbeat = heartbeat(stream, closed, close)
          use _ <- promise.await(messages(stream, subscription, closed))
          close()
          heartbeat
        })
    }
  })
}

fn messages(
  stream: hono.Stream,
  subscription: nats.Subscription,
  closed: fn() -> Bool,
) {
  case closed() {
    True -> promise.resolve(Nil)
    False -> {
      use next <- promise.await(nats.next_message(subscription))
      case next {
        Ok(Some(message)) ->
          case closed() {
            True -> promise.resolve(Nil)
            False -> {
              use written <- promise.await(hono.write_sse(
                stream,
                "notification",
                message,
              ))
              case written {
                Error(_) -> promise.resolve(Nil)
                Ok(_) -> messages(stream, subscription, closed)
              }
            }
          }
        _ -> promise.resolve(Nil)
      }
    }
  }
}

fn heartbeat(stream: hono.Stream, closed: fn() -> Bool, close: fn() -> Nil) {
  case closed() {
    True -> promise.resolve(Nil)
    False -> {
      use _ <- promise.await(hono.stream_sleep(stream, 25_000))
      case closed() {
        True -> promise.resolve(Nil)
        False -> {
          use written <- promise.await(hono.write_sse(stream, "ping", ""))
          case written {
            Error(_) -> {
              close()
              promise.resolve(Nil)
            }
            Ok(_) -> heartbeat(stream, closed, close)
          }
        }
      }
    }
  }
}
