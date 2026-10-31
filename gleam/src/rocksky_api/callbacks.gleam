//// Submission callbacks only, on a loopback port, so durable publication
//// does not queue behind public traffic on the REST service. No public
//// routes and no NATS subscribers: those stay with the REST service.

import envoy
import gleam/int
import gleam/javascript/promise
import gleam/result
import rocksky_api/context
import rocksky_api/env
import rocksky_api/error
import rocksky_api/log
import rocksky_api/node/hono
import rocksky_api/node/otel
import rocksky_api/node/process
import rocksky_api/submissions/app as submissions
import rocksky_api/telemetry/metrics

pub fn main() {
  otel.start("rocksky-api-callbacks", "0.0.1")
  process.set_dns_ipv4_first()
  let env = env.load()
  let port =
    envoy.get("SUBMISSIONS_CALLBACK_PORT")
    |> result.try(int.parse)
    |> result.unwrap(8099)
  use started <- promise.await(context.create(env, metrics.new()))
  case started {
    Error(e) -> {
      log.error("Failed to start: " <> error.describe(e))
      process.exit(1)
    }
    Ok(ctx) -> {
      hono.new()
      |> hono.route("/internal/submissions", submissions.app(ctx))
      |> hono.serve_on("127.0.0.1", port)
      log.info(
        "Rocksky submission callbacks listening on 127.0.0.1:"
        <> int.to_string(port),
      )
      promise.resolve(Nil)
    }
  }
}
