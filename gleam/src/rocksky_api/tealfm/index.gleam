import gleam/json
import gleam/option.{type Option}
import gleam/string
import rocksky_api/atproto/agent
import rocksky_api/context.{type Context}
import rocksky_api/lib/durable_submission
import rocksky_api/node/crypto
import rocksky_api/task
import rocksky_api/tealfm/publication.{type MusicbrainzTrack}
import rocksky_api/tealfm/push_enabled

pub fn publish_playing_now(
  ctx: Context,
  agent: agent.Agent,
  track: MusicbrainzTrack,
  duration: Int,
  identity: Option(String),
) {
  use did <- task.then(
    task.require(agent.did(agent), "Missing agent DID") |> task.from_result,
  )
  use enabled <- task.then(push_enabled.is_enabled(ctx, did))
  case enabled {
    False -> task.ok(Nil)
    True -> {
      let key =
        option.lazy_unwrap(identity, fn() {
          json.preprocessed_array([
            json.string(did),
            json.string(string.lowercase(track.name)),
            json.array(track.artists, fn(a) {
              json.string(string.lowercase(a.name))
            }),
            json.string(string.lowercase(track.album)),
            json.string(track.timestamp),
          ])
          |> json.to_string
          |> crypto.sha256_hex
        })
      use record <- task.then(
        publication.teal_record(track, duration) |> task.from_result,
      )
      durable_submission.enqueue_teal(
        durable_submission.Config(
          ctx.env.submissions_url,
          ctx.env.submissions_secret,
        ),
        did,
        publication.encode(record, publication.play_collection),
        key,
      )
      |> task.map(fn(_) { Nil })
    }
  }
}
