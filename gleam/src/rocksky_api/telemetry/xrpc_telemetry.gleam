//// One SERVER span per XRPC call, named by NSID.

import gleam/int
import gleam/string
import rocksky_api/node/express
import rocksky_api/node/js
import rocksky_api/node/otel
import rocksky_api/telemetry/metrics.{type Metrics}

pub fn middleware(metrics: Metrics) -> express.Middleware {
  express.middleware(fn(req, res, next) {
    let path = express.path(req)
    case string.starts_with(path, "/xrpc/") {
      False -> next()
      True -> {
        let nsid = case string.drop_start(path, 6) {
          "" -> "unknown"
          n -> n
        }
        let started = js.hrtime_nanos()
        let method = express.method(req)
        let parent = otel.parent_context(express.headers(req))
        let span =
          otel.start_server_span(
            "rocksky-xrpc",
            nsid,
            [
              #("xrpc.method", nsid),
              #("http.request.method", method),
              #("url.path", path),
            ],
            parent,
          )
        express.on_finish(res, fn() {
          let status = express.status_code(res)
          let seconds = int.to_float(js.hrtime_nanos() - started) /. 1.0e9
          otel.set_attribute_int(span, "http.response.status_code", status)
          case status >= 500 {
            True -> otel.set_status_error(span)
            False -> Nil
          }
          otel.end_span(span)
          let labels = [
            #("nsid", nsid),
            #("method", method),
            #("status", int.to_string(status)),
          ]
          otel.counter_add(metrics.xrpc_request_counter, 1, labels)
          otel.histogram_record(metrics.xrpc_request_duration, seconds, labels)
        })
        otel.with_span(parent, span, next)
      }
    }
  })
}
