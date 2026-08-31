//! `app.rocksky.equalizer.*` — Equalizer presets.

use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::generated::{EqualizerPresetView, ListPresetsOutput, PutPresetInput, RockboxEqualizerBand};

#[derive(Debug)]
pub struct EqualizerApi<'a> {
    client: &'a Client,
}

impl<'a> EqualizerApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// List equalizer presets.
    ///
    /// Pass a `did` (handle or DID) to fetch any user's presets publicly (no auth needed).
    /// Pass `None` to fetch the authenticated caller's own presets (auth required).
    /// XRPC: `app.rocksky.equalizer.listPresets`.
    pub async fn list_presets(&self, did: Option<&str>) -> Result<Vec<EqualizerPresetView>> {
        #[derive(Serialize)]
        struct Params<'a> {
            #[serde(skip_serializing_if = "Option::is_none")]
            did: Option<&'a str>,
        }
        let auth = did.is_none();
        let out: ListPresetsOutput = self
            .client
            .query_as("app.rocksky.equalizer.listPresets", &Params { did }, auth)
            .await?;
        Ok(out.presets)
    }

    /// Start building a `putPreset` call. The server slugifies `name` into the
    /// record key; putting the same name again overwrites the preset.
    /// XRPC: `app.rocksky.equalizer.putPreset`.
    pub fn put_preset(
        &self,
        name: impl Into<String>,
        bands: Vec<RockboxEqualizerBand>,
    ) -> PutPresetBuilder<'_> {
        PutPresetBuilder {
            client: self.client,
            body: PutPresetInput {
                name: name.into(),
                precut: None,
                bands,
            },
        }
    }

    /// Delete a preset by record key.
    /// XRPC: `app.rocksky.equalizer.deletePreset`.
    pub async fn delete_preset(&self, rkey: impl Into<String>) -> Result<()> {
        #[derive(Serialize)]
        struct Params {
            rkey: String,
        }
        self.client
            .procedure(
                "app.rocksky.equalizer.deletePreset",
                Some(&Params { rkey: rkey.into() }),
                None::<&()>,
                true,
            )
            .await?;
        Ok(())
    }
}

#[derive(Debug)]
pub struct PutPresetBuilder<'a> {
    client: &'a Client,
    body: PutPresetInput,
}

impl<'a> PutPresetBuilder<'a> {
    /// Pre-amplification cut in tenths of dB (-240..0, e.g. -60 = -6.0 dB).
    pub fn precut(mut self, precut: i64) -> Self {
        self.body.precut = Some(precut);
        self
    }

    pub async fn send(self) -> Result<EqualizerPresetView> {
        self.client
            .procedure_as(
                "app.rocksky.equalizer.putPreset",
                None::<&()>,
                Some(&self.body),
                true,
            )
            .await
    }
}
