import gleam/int
import gleam/option
import rocksky_api/node/process

pub fn number(name: String, default: Int) {
  process.env(name)
  |> option.then(fn(s) { int.parse(s) |> option.from_result })
  |> option.unwrap(default)
}

pub fn limit() {
  number("BACKFILL_LIMIT", 9_007_199_254_740_991)
}

pub fn dry_run() {
  option.unwrap(process.env("BACKFILL_DRY_RUN"), "") == "1"
}

pub fn user_id() {
  process.env("BACKFILL_USER_ID")
  |> option.then(fn(s) {
    case s {
      "" -> option.None
      _ -> option.Some(s)
    }
  })
}

pub fn extension(mime: String) {
  case mime {
    "audio/mpeg" -> "mp3"
    "audio/flac" -> "flac"
    "audio/mp4" | "audio/x-m4a" -> "m4a"
    "audio/ogg" -> "ogg"
    "audio/wav" | "audio/x-wav" -> "wav"
    "audio/aiff" | "audio/x-aiff" -> "aiff"
    _ -> ""
  }
}

/// Worker and page counts must advance even when an environment value is zero.
pub fn positive_number(name: String, default: Int) {
  int.max(1, number(name, default))
}
