import gleam/option.{type Option, None, Some}
import rocksky_api/lexicon/models
import rocksky_api/lib/repo_settings.{prefer}

pub fn patch(
  input: models.PutAudioSettingsInput,
  stored: models.RockboxSettingsView,
  now: String,
) -> models.RockboxSettingsView {
  models.RockboxSettingsView(
    ..stored,
    crossfade: crossfade(input.crossfade, stored.crossfade),
    equalizer: equalizer(input.equalizer, stored.equalizer),
    replay_gain: replay_gain(input.replay_gain, stored.replay_gain),
    tone: tone(input.tone, stored.tone),
    updated_at: Some(now),
  )
}

fn crossfade(
  patch: Option(models.RockboxCrossfadeSettings),
  stored: Option(models.RockboxCrossfadeSettings),
) -> Option(models.RockboxCrossfadeSettings) {
  case patch, stored {
    None, _ -> stored
    _, None -> patch
    Some(p), Some(s) ->
      Some(models.RockboxCrossfadeSettings(
        mode: prefer(p.mode, s.mode),
        fade_in_delay: prefer(p.fade_in_delay, s.fade_in_delay),
        fade_in_duration: prefer(p.fade_in_duration, s.fade_in_duration),
        fade_out_delay: prefer(p.fade_out_delay, s.fade_out_delay),
        fade_out_duration: prefer(p.fade_out_duration, s.fade_out_duration),
        fade_out_mix_mode: prefer(p.fade_out_mix_mode, s.fade_out_mix_mode),
      ))
  }
}

fn equalizer(
  patch: Option(models.RockboxEqualizerSettings),
  stored: Option(models.RockboxEqualizerSettings),
) -> Option(models.RockboxEqualizerSettings) {
  case patch, stored {
    None, _ -> stored
    _, None -> patch
    Some(p), Some(s) ->
      Some(models.RockboxEqualizerSettings(
        enabled: prefer(p.enabled, s.enabled),
        precut: prefer(p.precut, s.precut),
        bands: prefer(p.bands, s.bands),
      ))
  }
}

fn replay_gain(
  patch: Option(models.RockboxReplayGainSettings),
  stored: Option(models.RockboxReplayGainSettings),
) -> Option(models.RockboxReplayGainSettings) {
  case patch, stored {
    None, _ -> stored
    _, None -> patch
    Some(p), Some(s) ->
      Some(models.RockboxReplayGainSettings(
        mode: prefer(p.mode, s.mode),
        preamp: prefer(p.preamp, s.preamp),
        prevent_clipping: prefer(p.prevent_clipping, s.prevent_clipping),
      ))
  }
}

fn tone(
  patch: Option(models.RockboxToneSettings),
  stored: Option(models.RockboxToneSettings),
) -> Option(models.RockboxToneSettings) {
  case patch, stored {
    None, _ -> stored
    _, None -> patch
    Some(p), Some(s) ->
      Some(models.RockboxToneSettings(
        bass: prefer(p.bass, s.bass),
        treble: prefer(p.treble, s.treble),
        balance: prefer(p.balance, s.balance),
        channels: prefer(p.channels, s.channels),
      ))
  }
}
