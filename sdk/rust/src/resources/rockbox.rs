//! `app.rocksky.rockbox.*` — Rockbox audio settings.

use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::generated::{
    PutAudioSettingsInput, RockboxCrossfadeSettings, RockboxEqualizerSettings,
    RockboxReplayGainSettings, RockboxSettingsView, RockboxToneSettings,
};

#[derive(Debug)]
pub struct RockboxApi<'a> {
    client: &'a Client,
}

impl<'a> RockboxApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Get Rockbox audio settings.
    ///
    /// Pass a `did` to fetch any user's settings publicly (no auth needed).
    /// Pass `None` to fetch the authenticated caller's own settings (auth required).
    /// XRPC: `app.rocksky.rockbox.getAudioSettings`.
    pub async fn get_audio_settings(&self, did: Option<&str>) -> Result<RockboxSettingsView> {
        #[derive(Serialize)]
        struct Params<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            did: Option<&'a str>,
        }
        let auth = did.is_none();
        self.client
            .query_as("app.rocksky.rockbox.getAudioSettings", &Params { did }, auth)
            .await
    }

    /// Start building a `putAudioSettings` call.
    /// XRPC: `app.rocksky.rockbox.putAudioSettings`.
    pub fn put_audio_settings(&self) -> PutAudioSettingsBuilder<'_> {
        PutAudioSettingsBuilder {
            client: self.client,
            body: PutAudioSettingsInput {
                crossfade: None,
                equalizer: None,
                replay_gain: None,
                tone: None,
            },
        }
    }
}

#[derive(Debug)]
pub struct PutAudioSettingsBuilder<'a> {
    client: &'a Client,
    body: PutAudioSettingsInput,
}

impl<'a> PutAudioSettingsBuilder<'a> {
    pub fn crossfade(mut self, crossfade: RockboxCrossfadeSettings) -> Self {
        self.body.crossfade = Some(crossfade);
        self
    }

    pub fn equalizer(mut self, equalizer: RockboxEqualizerSettings) -> Self {
        self.body.equalizer = Some(equalizer);
        self
    }

    pub fn replay_gain(mut self, replay_gain: RockboxReplayGainSettings) -> Self {
        self.body.replay_gain = Some(replay_gain);
        self
    }

    pub fn tone(mut self, tone: RockboxToneSettings) -> Self {
        self.body.tone = Some(tone);
        self
    }

    pub async fn send(self) -> Result<RockboxSettingsView> {
        self.client
            .procedure_as(
                "app.rocksky.rockbox.putAudioSettings",
                None::<&()>,
                Some(&self.body),
                true,
            )
            .await
    }
}
