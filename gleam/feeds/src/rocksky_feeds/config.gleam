import gleam/int
import gleam/result
import gleam/string
import rocksky_feeds/types.{type Config, Config}

pub fn load(env: fn(String) -> String) -> Result(Config, String) {
  let production = env("NODE_ENV") == "production"
  let domain = case env("ROCKSKY_FEEDGEN_DOMAIN"), production {
    "", False -> "localhost"
    value, _ -> value
  }
  let database = case
    env("XATA_READ_POSTGRES_URL"),
    env("XATA_POSTGRES_URL"),
    production
  {
    "", "", False ->
      "postgresql://postgres:mysecretpassword@localhost:5433/rocksky?sslmode=disable"
    "", primary, _ -> primary
    replica, _, _ -> replica
  }
  let port = case env("ROCKSKY_FEEDGEN_PORT") {
    "" -> Ok(8002)
    value -> int.parse(value) |> result.map_error(fn(_) { Nil })
  }
  case
    domain == ""
    || string.contains(domain, "/")
    || string.contains(domain, " ")
    || database == ""
  {
    True ->
      Error(
        "Set ROCKSKY_FEEDGEN_DOMAIN to a hostname and XATA_POSTGRES_URL (or XATA_READ_POSTGRES_URL) to a database URL.",
      )
    False ->
      case port {
        Ok(port) if port > 0 && port <= 65_535 ->
          Ok(
            Config(domain, port, database, case env("COMMIT_SHA") {
              "" -> "unknown"
              value -> value
            }),
          )
        _ ->
          Error("ROCKSKY_FEEDGEN_PORT must be an integer between 1 and 65535.")
      }
  }
}
