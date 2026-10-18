import gleam/javascript/promise
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

pub const record_put_claim_ttl_seconds = 900

pub fn owns_record(uri: Option(String), did: String) -> Bool {
  case uri {
    None -> False
    Some(uri) -> string.starts_with(uri, "at://" <> did <> "/")
  }
}

fn key(did: String, collection: String, hash: String) {
  "record-put:v1:" <> did <> ":" <> collection <> ":" <> hash
}

pub fn claim_record_put(
  redis: redis.Client,
  did: String,
  collection: String,
  hash: String,
) {
  task.attempt_result(redis.set_nx_ex(
    redis,
    key(did, collection, hash),
    record_put_claim_ttl_seconds,
    "1",
  ))
}

pub fn release_record_put(
  redis: redis.Client,
  did: String,
  collection: String,
  hash: String,
) {
  task.attempt_result(redis.del(redis, [key(did, collection, hash)]))
  |> task.map(fn(_) { Nil })
}

pub fn put_record_once(
  redis: redis.Client,
  did: String,
  collection: String,
  hash: String,
  put: fn() -> Task(Option(String)),
) {
  use claimed <- task.then(claim_record_put(redis, did, collection, hash))
  case claimed {
    False -> task.ok(None)
    True -> {
      use outcome <- promise.await(put())
      case outcome {
        Ok(Some(uri)) if uri != "" -> task.ok(Some(uri))
        _ -> {
          use _ <- task.then(release_record_put(redis, did, collection, hash))
          task.from_result(outcome)
        }
      }
    }
  }
}
