import gleam/option.{None, Some}
import gleeunit/should
import rocksky_api/lexicon/models
import rocksky_api/xrpc/app/rocksky/equalizer/slug
import rocksky_api/xrpc/app/rocksky/rockbox/merge

pub fn preset_keys_test() {
  slug.preset_rkey("Bass Boost") |> should.equal("bass-boost")
  slug.preset_rkey("Treble  Boost") |> should.equal("treble-boost")
  slug.preset_rkey("Rock 'n' Roll!") |> should.equal("rock-n-roll")
  slug.preset_rkey("Café Vibes") |> should.equal("caf-vibes")
  slug.preset_rkey("--My - Preset--") |> should.equal("my-preset")
  slug.preset_rkey("a_b_c") |> should.equal("a-b-c")
  slug.preset_rkey("bass-boost") |> should.equal("bass-boost")
  slug.preset_rkey("!!!") |> should.equal("")
  slug.preset_rkey("   ") |> should.equal("")
}

pub fn sparse_settings_preserve_stored_fields_test() {
  let bands = [models.RockboxEqualizerBand(100, 20, 7)]
  let stored =
    models.RockboxSettingsView(
      ..models.new_rockbox_settings_view("created"),
      equalizer: Some(models.RockboxEqualizerSettings(
        Some(True),
        Some(10),
        Some(bands),
      )),
      tone: Some(models.RockboxToneSettings(
        Some(5),
        Some(10),
        Some(0),
        Some("stereo"),
      )),
    )
  let input =
    models.PutAudioSettingsInput(
      ..models.new_put_audio_settings_input(),
      equalizer: Some(models.RockboxEqualizerSettings(None, Some(0), None)),
      tone: Some(models.RockboxToneSettings(None, None, Some(-50), None)),
    )
  let updated = merge.patch(input, stored, "updated")
  updated.equalizer
  |> should.equal(
    Some(models.RockboxEqualizerSettings(Some(True), Some(0), Some(bands))),
  )
  updated.tone
  |> should.equal(
    Some(models.RockboxToneSettings(
      Some(5),
      Some(10),
      Some(-50),
      Some("stereo"),
    )),
  )
  updated.created_at |> should.equal("created")
  updated.updated_at |> should.equal(Some("updated"))
}

pub fn false_and_empty_bands_replace_existing_settings_test() {
  let stored =
    models.RockboxSettingsView(
      ..models.new_rockbox_settings_view("created"),
      equalizer: Some(models.RockboxEqualizerSettings(
        Some(True),
        Some(10),
        Some([models.RockboxEqualizerBand(100, 20, 7)]),
      )),
    )
  let input =
    models.PutAudioSettingsInput(
      ..models.new_put_audio_settings_input(),
      equalizer: Some(models.RockboxEqualizerSettings(
        Some(False),
        None,
        Some([]),
      )),
    )
  merge.patch(input, stored, "updated").equalizer
  |> should.equal(
    Some(models.RockboxEqualizerSettings(Some(False), Some(10), Some([]))),
  )
}
