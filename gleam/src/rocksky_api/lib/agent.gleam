//// Builds an authenticated agent for a DID from the stored OAuth or
//// app-password session, retrying transient failures.

import gleam/javascript/promise
import gleam/json
import gleam/option.{type Option, None, Some}
import rocksky_api/atproto/agent.{type Agent}
import rocksky_api/atproto/oauth
import rocksky_api/auth/store
import rocksky_api/context.{type Context}
import rocksky_api/error
import rocksky_api/lib/extract_pds
import rocksky_api/log
import rocksky_api/node/js
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

/// Body for 401 responses when the user's PDS session is dead.
pub fn pds_session_expired_json() -> json.Json {
  json.object([
    #("status", json.string("unauthorized")),
    #("error", json.string("pds_session_expired")),
    #(
      "message",
      json.string(
        "Your session with your PDS has expired. Please log in to Rocksky again.",
      ),
    ),
  ])
}

/// `None` when the user has to sign in again.
pub fn create(ctx: Context, did: String) -> Task(Option(Agent)) {
  attempt(ctx, did, 0)
}

/// Like `create`, failing with `PdsSessionExpired` instead of `None`.
pub fn require(ctx: Context, did: String) -> Task(Agent) {
  use agent <- task.try_map(create(ctx, did))
  case agent {
    Some(a) -> Ok(a)
    None -> Error(error.PdsSessionExpired)
  }
}

fn attempt(ctx: Context, did: String, retry: Int) -> Task(Option(Agent)) {
  use outcome <- promise.await(try_once(ctx, did))
  case outcome {
    Done(agent) -> task.ok(agent)
    Retry if retry < 4 -> {
      use _ <- promise.await(promise.wait(1000))
      attempt(ctx, did, retry + 1)
    }
    Retry -> task.ok(None)
  }
}

type Outcome {
  Done(Option(Agent))
  Retry
}

fn try_once(ctx: Context, did: String) -> promise.Promise(Outcome) {
  use stored <- promise.await(store.get_session(ctx.sqlite, "atp:" <> did))
  case stored {
    Ok(Some(session_json)) -> resume_app_password(ctx, did, session_json)
    Ok(None) -> restore_oauth(ctx, did)
    Error(e) -> {
      log.info("Error creating agent")
      log.info(did)
      log.info(error.describe(e))
      promise.resolve(Retry)
    }
  }
}

fn resume_app_password(
  ctx: Context,
  did: String,
  session_json: String,
) -> promise.Promise(Outcome) {
  use pds <- promise.await(pds_for(ctx, did))
  case pds {
    Error(e) -> {
      log.warn(
        "Could not resolve the PDS for " <> did <> ": " <> error.to_string(e),
      )
      promise.resolve(Retry)
    }
    Ok(pds) -> {
      let agent = agent.atp_agent(pds)
      case js.parse_json(session_json) {
        Error(_) -> promise.resolve(Retry)
        Ok(session) -> {
          use resumed <- promise.await(agent.resume_session(agent, session))
          case resumed {
            Ok(_) -> promise.resolve(Done(Some(agent)))
            Error(e) ->
              case agent.is_session_rejected(e) {
                True -> {
                  log.info(
                    "Stored app-password session for "
                    <> did
                    <> " was rejected by the PDS, removing it",
                  )
                  log.info(js.describe(e))
                  use _ <- promise.await(store.delete_session(
                    ctx.sqlite,
                    "atp:" <> did,
                  ))
                  promise.resolve(Done(None))
                }
                False -> {
                  log.warn(
                    "Could not resume the session for " <> did <> ", retrying",
                  )
                  log.warn(js.describe(e))
                  promise.resolve(Retry)
                }
              }
          }
        }
      }
    }
  }
}

fn restore_oauth(ctx: Context, did: String) -> promise.Promise(Outcome) {
  use restored <- promise.await(oauth.restore(ctx.oauth_client, did))
  case restored {
    Ok(session) -> promise.resolve(Done(Some(agent.from_session(session))))
    Error(e) ->
      case oauth.is_session_rejected(e) {
        True -> {
          log.info("Session for " <> did <> " is no longer valid")
          log.info(js.describe(e))
          promise.resolve(Done(None))
        }
        False -> {
          log.warn("Could not restore the session for " <> did <> ", retrying")
          log.warn(js.describe(e))
          promise.resolve(Retry)
        }
      }
  }
}

/// The user's PDS endpoint, cached in Redis for 15 minutes.
pub fn pds_for(ctx: Context, did: String) -> Task(String) {
  use cached <- task.then(
    task.attempt_result(redis.get(ctx.redis, "pds:" <> did)),
  )
  case cached {
    Some(pds) -> task.ok(pds)
    None -> {
      use pds <- task.then(extract_pds.from_did(ctx.env.plc_directory_url, did))
      use _ <- task.map(
        task.attempt_result(redis.set_ex(ctx.redis, "pds:" <> did, 900, pds)),
      )
      pds
    }
  }
}
