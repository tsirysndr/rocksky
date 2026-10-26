import gleam/int
import gleam/javascript/promise
import gleam/json
import gleam/list
import gleam/option.{None}
import gleam/result
import gleam/string
import rocksky_feeds/catalog
import rocksky_feeds/config
import rocksky_feeds/feed
import rocksky_feeds/host
import rocksky_feeds/types.{
  type Config, type Query, type Response, type Row, All, Response,
}

pub fn error(status: Int, name: String, message: String) -> Response {
  Response(
    status,
    json.object([
      #("error", json.string(name)),
      #("message", json.string(message)),
    ])
      |> json.to_string,
    "application/json",
  )
}

fn ok(body: json.Json) -> Response {
  Response(200, json.to_string(body), "application/json")
}

fn parameter(
  params: List(#(String, String)),
  key: String,
  default: String,
) -> String {
  list.key_find(params, key) |> result.unwrap(default)
}

pub fn handle(
  config: Config,
  method: String,
  path: String,
  params: List(#(String, String)),
  authorization: String,
  query: fn(Query) -> promise.Promise(Result(List(Row), String)),
  verify: fn(String) -> promise.Promise(Bool),
) -> promise.Promise(Response) {
  case method {
    "GET" | "HEAD" -> route(config, path, params, authorization, query, verify)
    _ -> promise.resolve(error(405, "MethodNotAllowed", "Use GET"))
  }
}

fn route(
  config: Config,
  path: String,
  params: List(#(String, String)),
  authorization: String,
  query: fn(Query) -> promise.Promise(Result(List(Row), String)),
  verify: fn(String) -> promise.Promise(Bool),
) -> promise.Promise(Response) {
  case path {
    "/" ->
      promise.resolve(Response(
        200,
        "This is a Feed Generation service! Most endpoints are under /xrpc",
        "text/plain",
      ))
    "/xrpc/_health" ->
      promise.resolve(
        ok(json.object([#("version", json.string(config.version))])),
      )
    "/.well-known/did.json" ->
      promise.resolve(
        ok(
          json.object([
            #(
              "@context",
              json.array(["https://www.w3.org/ns/did/v1"], json.string),
            ),
            #("id", json.string("did:web:" <> config.domain)),
            #(
              "service",
              json.array(
                [
                  json.object([
                    #("id", json.string("#rocksky_fg")),
                    #("type", json.string("RockskyFeedGenerator")),
                    #(
                      "serviceEndpoint",
                      json.string("https://" <> config.domain),
                    ),
                  ]),
                ],
                fn(x) { x },
              ),
            ),
          ]),
        ),
      )
    "/xrpc/app.rocksky.feed.describeFeedGenerator" ->
      promise.resolve(
        ok(
          json.object([
            #("did", json.string("did:web:" <> config.domain)),
            #(
              "feeds",
              json.array(catalog.algorithms(), fn(algo) {
                json.object([#("uri", json.string(catalog.uri(algo)))])
              }),
            ),
          ]),
        ),
      )
    "/xrpc/app.rocksky.feed.getFeedSkeleton" ->
      skeleton(params, authorization, query, verify)
    _ -> promise.resolve(error(404, "NotFound", "Not found"))
  }
}

fn skeleton(
  params: List(#(String, String)),
  authorization: String,
  query: fn(Query) -> promise.Promise(Result(List(Row), String)),
  verify: fn(String) -> promise.Promise(Bool),
) -> promise.Promise(Response) {
  let uri = parameter(params, "feed", "")
  let limit = parameter(params, "limit", "50") |> int.parse
  let offset = parameter(params, "offset", "0") |> int.parse
  case host.valid_uri(uri), limit, offset {
    True, Ok(limit), Ok(offset) if limit >= 1 && offset >= 0 ->
      case catalog.find(uri) {
        Error(_) -> {
          host.outcome("unknown", "unsupported_algorithm")
          promise.resolve(error(
            400,
            "UnsupportedAlgorithm",
            "Unsupported algorithm",
          ))
        }
        Ok(algorithm) -> {
          let raw_cursor = parameter(params, "cursor", "")
          let cursor = host.cursor(raw_cursor)
          case algorithm == All && raw_cursor != "" && cursor == None {
            True ->
              promise.resolve(error(400, "InvalidRequest", "Invalid cursor"))
            False -> {
              use authenticated <- promise.await(case authorization {
                "Bearer " <> token -> verify(string.trim(token))
                _ -> promise.resolve(False)
              })
              use rows <- promise.map(
                host.feed_span(
                  catalog.key(algorithm),
                  catalog.publisher,
                  limit,
                  raw_cursor != "",
                  authenticated,
                  fn() { query(feed.query(algorithm, limit, cursor)) },
                ),
              )
              case rows {
                Ok(rows) -> Response(200, feed.encode(rows), "application/json")
                Error(_) ->
                  error(500, "InternalServerError", "Feed query failed")
              }
            }
          }
        }
      }
    _, _, _ ->
      promise.resolve(error(
        400,
        "InvalidRequest",
        "Expected a feed AT URI, a positive integer limit, and a nonnegative offset",
      ))
  }
}

pub fn main() -> Nil {
  case config.load(host.env) {
    Error(message) -> host.fail(message)
    Ok(config) -> {
      let database = host.open_database(config.database_url)
      host.serve(config, database, fn(method, path, params, authorization) {
        handle(
          config,
          method,
          path,
          params,
          authorization,
          fn(query) { host.query(database, query) },
          host.verify,
        )
      })
    }
  }
}
