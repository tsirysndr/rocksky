import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/option.{type Option}
import gleam/result
import gleam/string
import rocksky_api/db/row
import rocksky_api/node/crypto
import rocksky_api/node/redis
import rocksky_api/task

const reserve_script =
  "
local at = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
if redis.call('ZSCORE', KEYS[1], ARGV[3]) then
  redis.call('EXPIRE', KEYS[1], 300)
  return 1
end
if redis.call('ZCOUNT', KEYS[1], at - window, at + window) > 0 then
  return 0
end
redis.call('ZADD', KEYS[1], at, ARGV[3])
redis.call('EXPIRE', KEYS[1], 300)
return 1
"

pub fn reserve_scrobble(
  redis: redis.Client,
  did: String,
  title: String,
  artist: String,
  timestamp: Int,
  window_seconds: Int,
  owner: Option(String),
) {
  let identity =
    json.array([string.lowercase(title), string.lowercase(artist)], json.string)
    |> json.to_string
    |> crypto.sha256_hex
  let owner = option.lazy_unwrap(owner, crypto.random_uuid)
  use reply <- task.map(
    task.attempt_result(
      redis.eval(
        redis,
        reserve_script,
        ["scrobble-window:v1:" <> did <> ":" <> identity],
        [int.to_string(timestamp), int.to_string(window_seconds), owner],
      ),
    ),
  )
  decode.run(reply, row.int()) |> result.unwrap(0) == 1
}
