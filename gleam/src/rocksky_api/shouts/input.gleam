import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string
import rocksky_api/error
import rocksky_api/lexicon/models

pub type Input {
  Input(
    message: Option(String),
    gif: Option(models.ShoutGif),
    facets: List(models.ShoutMention),
  )
}

pub fn decoder() {
  use message <- decode.optional_field(
    "message",
    None,
    decode.map(decode.string, Some),
  )
  use gif <- decode.optional_field(
    "gif",
    None,
    decode.map(models.shout_gif_decoder(), Some),
  )
  use facets <- decode.optional_field(
    "facets",
    [],
    decode.list(models.shout_mention_decoder()),
  )
  decode.success(Input(message, gif, facets))
}

pub fn validate(input: Input) {
  let valid_gif = case input.gif {
    None -> True
    Some(g) ->
      valid_url(g.url)
      && option.unwrap(option.map(g.preview_url, valid_url), True)
      && utf16_length(option.unwrap(g.alt, "")) <= 512
      && option.unwrap(g.width, 0) >= 0
      && option.unwrap(g.height, 0) >= 0
  }
  case
    utf16_length(option.unwrap(input.message, "")) <= 1000
    && valid_gif
    && list.all(input.facets, fn(f) { f.byte_start >= 0 && f.byte_end >= 0 })
    && {
      string.trim(option.unwrap(input.message, "")) != ""
      || option.is_some(input.gif)
    }
  {
    True -> Ok(input)
    False ->
      Error(error.InvalidRequest("A shout must have valid text or a GIF"))
  }
}

pub fn fields(input: Input) {
  list.flatten([
    case input.message {
      Some(s) if s != "" -> [#("message", json.string(s))]
      _ -> []
    },
    case input.gif {
      Some(g) -> [#("gif", models.encode_shout_gif(g))]
      None -> []
    },
    case input.facets {
      [] -> []
      fs -> [#("facets", json.array(fs, models.encode_shout_mention))]
    },
  ])
}

@external(javascript, "./input_ffi.mjs", "validUrl")
fn valid_url(value: String) -> Bool

@external(javascript, "./input_ffi.mjs", "utf16Length")
fn utf16_length(value: String) -> Int
