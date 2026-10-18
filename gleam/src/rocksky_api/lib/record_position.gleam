import gleam/option.{type Option, Some}

pub fn record_position(value: Option(Int)) -> Int {
  case value {
    Some(n) if n >= 1 && n <= 9_007_199_254_740_991 -> n
    _ -> 1
  }
}
