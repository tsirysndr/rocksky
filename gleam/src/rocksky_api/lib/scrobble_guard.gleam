//// Bot-scrobble guard: a persistent `is_bot` flag plus a rolling window of
//// accepted scrobbles per user.

import gleam/int
import gleam/option.{type Option, None, Some}
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{eq, field, one, select, where}
import rocksky_api/drizzle/schema/users
import rocksky_api/error.{type Error}
import rocksky_api/node/crypto
import rocksky_api/node/redis
import rocksky_api/task.{type Task}

pub type Blocked {
  /// Temporarily blocked; retry after this many seconds.
  RateExceeded(did: String, retry_after: Int)
  /// The offline sweep flagged the account; cleared only by an operator.
  BotFlagged(did: String)
}

fn block_key(did: String) -> String {
  "scrobble:block:" <> did
}

fn rate_key(did: String) -> String {
  "scrobble:rate:" <> did
}

pub fn blocked_message(retry_after_seconds: Int) -> String {
  let minutes = int.max(1, { retry_after_seconds + 59 } / 60)
  "Your account has been temporarily blocked from scrobbling because we detected "
  <> "an abnormally high scrobble rate — scrobbles are arriving faster than tracks can "
  <> "physically be played, which is a pattern typical of bots or misconfigured clients. "
  <> "Normal listening never triggers this. To resume, submit one scrobble per track only "
  <> "after it has actually played (roughly half its length or ~4 minutes, as Last.fm does), "
  <> "rather than on a fixed short timer. If you believe this is a mistake, contact "
  <> "support@rocksky.app. You can retry in about "
  <> int.to_string(minutes)
  <> " minute(s)."
}

pub fn bot_flagged_message() -> String {
  "Your account has been flagged as a bot and can no longer scrobble. This "
  <> "happens when scrobbles arrive continuously, around the clock, faster than "
  <> "tracks can physically be played — a pattern real listening never produces. "
  <> "If you believe this is a mistake, contact support@rocksky.app to have it reviewed."
}

/// `Ok(Some(block))` when the user must be rejected.
pub fn check_bot_flag(ctx: Context, did: String) -> Task(Option(Blocked)) {
  let table = users.table()
  use row <- task.map(
    select(table, field("is_bot", users.is_bot(table)))
    |> where(eq(users.did(table), did))
    |> one(ctx.db),
  )
  case row {
    Some(True) -> Some(BotFlagged(did))
    _ -> None
  }
}

pub fn check_block(ctx: Context, did: String) -> Task(Option(Blocked)) {
  case ctx.env.scrobble_abuse_max <= 0 {
    True -> task.ok(None)
    False -> {
      use ttl <- task.map(
        task.attempt_result(redis.ttl(ctx.redis, block_key(did))),
      )
      case ttl > 0 {
        True -> Some(RateExceeded(did, ttl))
        False -> None
      }
    }
  }
}

/// Both checks; the first block found wins.
pub fn check(ctx: Context, did: String) -> Task(Option(Blocked)) {
  use flagged <- task.then(check_bot_flag(ctx, did))
  case flagged {
    Some(b) -> task.ok(Some(b))
    None -> check_block(ctx, did)
  }
}

/// Fails with the block as an error, for pipelines that abort on it.
pub fn assert_allowed(ctx: Context, did: String) -> Task(Nil) {
  use blocked <- task.try_map(check(ctx, did))
  case blocked {
    Some(b) -> Error(to_error(b))
    None -> Ok(Nil)
  }
}

pub fn to_error(b: Blocked) -> Error {
  case b {
    RateExceeded(_, retry_after) ->
      error.ScrobbleBlocked(retry_after, blocked_message(retry_after))
    BotFlagged(_) -> error.ScrobbleBotFlagged(bot_flagged_message())
  }
}

/// Records an accepted scrobble; places a block when the window overflows.
/// Call only for genuinely new scrobbles (after dedup).
pub fn record_and_guard(
  ctx: Context,
  did: String,
  scrobble_time_unix: Int,
  submission_id: Option(String),
) -> Task(Option(Blocked)) {
  let env = ctx.env
  case env.scrobble_abuse_max <= 0 {
    True -> task.ok(None)
    False -> {
      let now_ms = scrobble_time_unix * 1000
      let window_start = now_ms - env.scrobble_abuse_window * 1000
      let member =
        int.to_string(now_ms)
        <> ":"
        <> option.unwrap(submission_id, crypto.random_uuid())
      use count <- task.then(
        task.attempt_result(redis.sliding_window_count(
          ctx.redis,
          rate_key(did),
          now_ms,
          member,
          window_start,
          env.scrobble_abuse_window,
        )),
      )
      case count > env.scrobble_abuse_max {
        True -> {
          use _ <- task.map(
            task.attempt_result(redis.set_ex(
              ctx.redis,
              block_key(did),
              env.scrobble_abuse_block,
              "1",
            )),
          )
          Some(RateExceeded(did, env.scrobble_abuse_block))
        }
        False -> task.ok(None)
      }
    }
  }
}
