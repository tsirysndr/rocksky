//// `app.rocksky.rockbox.*` — Rockbox audio settings.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import gleam/json.{type Json}
import gleam/list
import gleam/option.{type Option, None, Some}
import rocksky.{type Request}

/// Get the authenticated user's Rockbox audio settings.
pub fn get_audio_settings() -> Request(Dynamic) {
  rocksky.query("app.rocksky.rockbox.getAudioSettings", decode.dynamic)
}

/// Start building a `putAudioSettings` call.
pub fn put_audio_settings() -> PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(
    crossfade: None,
    equalizer: None,
    replay_gain: None,
    tone: None,
  )
}

pub type PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(
    crossfade: Option(Json),
    equalizer: Option(Json),
    replay_gain: Option(Json),
    tone: Option(Json),
  )
}

pub fn with_crossfade(
  builder: PutAudioSettingsBuilder,
  crossfade: Json,
) -> PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(..builder, crossfade: Some(crossfade))
}

pub fn with_equalizer(
  builder: PutAudioSettingsBuilder,
  equalizer: Json,
) -> PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(..builder, equalizer: Some(equalizer))
}

pub fn with_replay_gain(
  builder: PutAudioSettingsBuilder,
  replay_gain: Json,
) -> PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(..builder, replay_gain: Some(replay_gain))
}

pub fn with_tone(
  builder: PutAudioSettingsBuilder,
  tone: Json,
) -> PutAudioSettingsBuilder {
  PutAudioSettingsBuilder(..builder, tone: Some(tone))
}

pub fn send(builder: PutAudioSettingsBuilder) -> Request(Dynamic) {
  let fields =
    [
      case builder.crossfade {
        Some(v) -> [#("crossfade", v)]
        None -> []
      },
      case builder.equalizer {
        Some(v) -> [#("equalizer", v)]
        None -> []
      },
      case builder.replay_gain {
        Some(v) -> [#("replayGain", v)]
        None -> []
      },
      case builder.tone {
        Some(v) -> [#("tone", v)]
        None -> []
      },
    ]
    |> list.flatten

  rocksky.procedure("app.rocksky.rockbox.putAudioSettings", decode.dynamic)
  |> rocksky.body(json.object(fields))
}
