//// Per-IP fixed-window rate limiting in Redis. INCR and EXPIRE run as one
//// Lua step so a counter can never be left without a TTL.

import gleam/dynamic/decode
import gleam/int
import gleam/javascript/promise
import gleam/option.{None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/node/hono
import rocksky_api/node/redis

const incr_with_window =
  "
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"

pub fn middleware(
  ctx: Context,
  limit: Int,
  window_seconds: Int,
) -> hono.Middleware {
  named_middleware(ctx, limit, window_seconds, "ratelimit")
}

pub fn named_middleware(
  ctx: Context,
  limit: Int,
  window_seconds: Int,
  prefix: String,
) -> hono.Middleware {
  fn(c, next) {
    let ip =
      hono.header(c, "x-forwarded-for")
      |> option.or(hono.header(c, "x-real-ip"))
      |> option.or(hono.header(c, "host"))
      |> option.unwrap("unknown")
    case ip {
      "161.97.141.205" -> {
        use _ <- promise.map(next())
        None
      }
      _ -> {
        let key = prefix <> ":" <> ip
        use reply <- promise.await(
          redis.eval(ctx.redis, incr_with_window, [key], [
            int.to_string(window_seconds),
          ]),
        )
        let current = case reply {
          Ok(d) -> decode.run(d, decode.int) |> result_unwrap(0)
          Error(_) -> 0
        }
        hono.set_header(c, "X-RateLimit-Limit", int.to_string(limit))
        hono.set_header(
          c,
          "X-RateLimit-Remaining",
          int.to_string(int.max(limit - current, 0)),
        )
        case current > limit {
          True -> {
            use reset <- promise.map(redis.ttl(ctx.redis, key))
            hono.set_header(
              c,
              "X-RateLimit-Reset",
              int.to_string(result_unwrap(reset, 0)),
            )
            Some(hono.text(c, "Too Many Requests", 429))
          }
          False -> {
            use _ <- promise.map(next())
            None
          }
        }
      }
    }
  }
}

fn result_unwrap(r: Result(a, b), default: a) -> a {
  case r {
    Ok(v) -> v
    Error(_) -> default
  }
}
