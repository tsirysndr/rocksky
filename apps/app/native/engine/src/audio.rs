//! Wire settings use tenths of dB/Q and milliseconds; native DSP uses dB/Q.
use rockbox_playback::{
    ChannelMode, CrossfadeMode, CrossfadeSettings, EqBand, Equalizer, MixMode, Player,
    ReplayGainMode, ToneControls,
};
use serde_json::{json, Value};
use std::time::Duration;

pub struct AudioSettings {
    document: Value,
}
impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            document: json!({
                "equalizer": {"enabled": false, "precut": 0, "bands": []},
                "tone": {"bass": 0, "treble": 0, "balance": 0, "channels": "stereo", "stereoWidth": 100},
                "crossfade": {"mode": "off", "fadeInDelay": 0, "fadeInDuration": 2000, "fadeOutDelay": 0, "fadeOutDuration": 2000, "fadeOutMixMode": "crossfade"},
                "replayGain": {"mode": "off", "preamp": 0, "preventClipping": false}
            }),
        }
    }
}
fn number(v: &Value, key: &str, min: i64, max: i64) -> i32 {
    v[key].as_i64().unwrap_or(0).clamp(min, max) as i32
}
impl AudioSettings {
    pub fn merge(&mut self, patch: Value) {
        for section in ["equalizer", "tone", "crossfade", "replayGain"] {
            if let Some(fields) = patch[section].as_object() {
                for (key, value) in fields {
                    self.document[section][key] = value.clone();
                }
            }
        }
    }
    fn equalizer(&self) -> Equalizer {
        let eq = &self.document["equalizer"];
        Equalizer {
            enabled: eq["enabled"].as_bool().unwrap_or(false),
            precut_db: -number(eq, "precut", -240, 0) as f32 / 10.0,
            bands: eq["bands"]
                .as_array()
                .into_iter()
                .flatten()
                .take(10)
                .map(|b| EqBand {
                    cutoff_hz: number(b, "frequency", 20, 22000),
                    q: number(b, "q", 5, 640) as f32 / 10.0,
                    gain_db: number(b, "gain", -240, 240) as f32 / 10.0,
                })
                .collect(),
        }
    }
    fn crossfade(&self, shuffle: bool) -> CrossfadeSettings {
        let cf = &self.document["crossfade"];
        CrossfadeSettings {
            mode: match cf["mode"].as_str().unwrap_or("off") {
                "enabled" => CrossfadeMode::Always,
                "shuffle" if shuffle => CrossfadeMode::Always,
                // The engine has no album-boundary policy. Match the desktop's auto-skip fallback.
                "albumChange" | "trackChange" => CrossfadeMode::AutoSkip,
                _ => CrossfadeMode::Off,
            },
            fade_in_delay: Duration::from_millis(number(cf, "fadeInDelay", 0, 7000) as u64),
            fade_in_duration: Duration::from_millis(number(cf, "fadeInDuration", 0, 15000) as u64),
            fade_out_delay: Duration::from_millis(number(cf, "fadeOutDelay", 0, 7000) as u64),
            fade_out_duration: Duration::from_millis(number(cf, "fadeOutDuration", 0, 15000) as u64),
            mix_mode: if cf["fadeOutMixMode"] == "mix" {
                MixMode::Mix
            } else {
                MixMode::Crossfade
            },
        }
    }
    fn replaygain_mode(&self, shuffle: bool) -> ReplayGainMode {
        match self.document["replayGain"]["mode"]
            .as_str()
            .unwrap_or("off")
        {
            "track" => ReplayGainMode::Track,
            "album" => ReplayGainMode::Album,
            "trackIfShuffling" if shuffle => ReplayGainMode::Track,
            "trackIfShuffling" => ReplayGainMode::Album,
            _ => ReplayGainMode::Off,
        }
    }
    pub fn apply(&self, player: &Player, shuffle: bool) {
        player.set_equalizer(self.equalizer());
        let tone = &self.document["tone"];
        player.set_tone(ToneControls {
            bass_db: number(tone, "bass", -24, 24),
            treble_db: number(tone, "treble", -24, 24),
            bass_cutoff_hz: number(tone, "bassCutoff", 0, 22000),
            treble_cutoff_hz: number(tone, "trebleCutoff", 0, 22000),
        });
        player.set_balance(number(tone, "balance", -100, 100));
        player.set_channel_mode(match tone["channels"].as_str().unwrap_or("stereo") {
            "mono" => ChannelMode::Mono,
            "monoLeft" => ChannelMode::MonoLeft,
            "monoRight" => ChannelMode::MonoRight,
            "karaoke" => ChannelMode::Karaoke,
            "custom" | "wide" => ChannelMode::Custom,
            "swap" => ChannelMode::Swap,
            _ => ChannelMode::Stereo,
        });
        player.set_stereo_width(if tone["channels"] == "wide" {
            150
        } else {
            number(tone, "stereoWidth", 0, 250)
        });
        player.set_crossfade(self.crossfade(shuffle));
        let rg = &self.document["replayGain"];
        player.set_replaygain(
            self.replaygain_mode(shuffle),
            number(rg, "preamp", -120, 120) as f32 / 10.0,
            rg["preventClipping"].as_bool().unwrap_or(false),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_patches_preserve_values_and_convert_units() {
        let mut settings = AudioSettings::default();
        settings.merge(json!({"equalizer":{"enabled":true,"precut":-35,"bands":[{"frequency":1000,"q":70,"gain":65}]},"crossfade":{"mode":"enabled","fadeInDuration":4500,"fadeOutMixMode":"mix"}}));
        settings.merge(json!({"equalizer":{"precut":-40},"crossfade":{"fadeInDelay":250}}));
        let eq = settings.equalizer();
        assert!(eq.enabled);
        assert_eq!(eq.precut_db, 4.0);
        assert_eq!(eq.bands[0].gain_db, 6.5);
        assert_eq!(eq.bands[0].q, 7.0);
        let cf = settings.crossfade(false);
        assert_eq!(cf.mode, CrossfadeMode::Always);
        assert_eq!(cf.fade_in_duration, Duration::from_millis(4500));
        assert_eq!(cf.fade_in_delay, Duration::from_millis(250));
        assert_eq!(cf.fade_out_duration, Duration::from_secs(2));
        assert_eq!(cf.mix_mode, MixMode::Mix);
    }
    #[test]
    fn conditional_modes_follow_shuffle_and_can_be_disabled() {
        let mut settings = AudioSettings::default();
        settings.merge(
            json!({"crossfade":{"mode":"shuffle"},"replayGain":{"mode":"trackIfShuffling"}}),
        );
        assert_eq!(settings.crossfade(false).mode, CrossfadeMode::Off);
        assert_eq!(settings.crossfade(true).mode, CrossfadeMode::Always);
        assert_eq!(settings.replaygain_mode(false), ReplayGainMode::Album);
        assert_eq!(settings.replaygain_mode(true), ReplayGainMode::Track);
        settings.merge(json!({"crossfade":{"mode":"off"},"replayGain":{"mode":"off"}}));
        assert_eq!(settings.crossfade(true).mode, CrossfadeMode::Off);
        assert_eq!(settings.replaygain_mode(true), ReplayGainMode::Off);
    }
}
