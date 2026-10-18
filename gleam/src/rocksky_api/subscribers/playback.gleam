import gleam/int
import gleam/option.{type Option, None, Some}

pub fn remaining_playback_ms(last: Option(#(Int, Int)), now: Int) {
  case last {
    None | Some(#(_, 0)) -> 0
    Some(#(started_at, duration_ms)) ->
      int.max(0, started_at + duration_ms - now)
  }
}
