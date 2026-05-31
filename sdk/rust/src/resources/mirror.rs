//! `app.rocksky.mirror.*` — external mirroring sources (Last.fm, ListenBrainz, …).

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{MirrorSource, MirrorSourcesEnvelope};

#[derive(Debug)]
pub struct MirrorApi<'a> {
    client: &'a Client,
}

impl<'a> MirrorApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn list_sources(&self) -> Result<Vec<MirrorSource>> {
        let value: Value = self
            .client
            .call_with("app.rocksky.mirror.getMirrorSources", &(), true)
            .await?;
        if let Value::Array(items) = &value {
            return Ok(items
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect());
        }
        let env: MirrorSourcesEnvelope = serde_json::from_value(value).unwrap_or_default();
        Ok(env.sources)
    }

    pub fn put_source(&self, provider: impl Into<String>) -> PutMirrorSource<'_> {
        PutMirrorSource {
            client: self.client,
            body: PutSourceBody {
                provider: provider.into(),
                enabled: None,
                external_username: None,
                api_key: None,
            },
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PutSourceBody {
    provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
}

#[derive(Debug)]
pub struct PutMirrorSource<'a> {
    client: &'a Client,
    body: PutSourceBody,
}

impl<'a> PutMirrorSource<'a> {
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.body.enabled = Some(enabled);
        self
    }
    pub fn external_username(mut self, username: impl Into<String>) -> Self {
        self.body.external_username = Some(username.into());
        self
    }
    pub fn api_key(mut self, key: impl Into<String>) -> Self {
        self.body.api_key = Some(key.into());
        self
    }
    pub async fn send(self) -> Result<Value> {
        self.client
            .procedure_as(
                "app.rocksky.mirror.putMirrorSource",
                None::<&()>,
                Some(&self.body),
                true,
            )
            .await
    }
}
