//! `app.rocksky.apikey.*` — API key management for the authenticated user.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{ApiKey, ApikeysEnvelope};

#[derive(Debug)]
pub struct ApikeyApi<'a> {
    client: &'a Client,
}

impl<'a> ApikeyApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// List the authenticated user's API keys.
    pub fn list(&self) -> ListApikeys<'_> {
        ListApikeys {
            client: self.client,
            params: Page {
                limit: None,
                offset: None,
            },
        }
    }

    /// Create a new API key.
    pub async fn create(
        &self,
        name: impl Into<String>,
        description: Option<String>,
    ) -> Result<ApiKey> {
        #[derive(Serialize)]
        struct B {
            name: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.apikey.createApikey",
                None::<&()>,
                Some(&B {
                    name: name.into(),
                    description,
                }),
                true,
            )
            .await
    }

    /// Update an API key.
    pub async fn update(
        &self,
        api_key_id: impl Into<String>,
        name: impl Into<String>,
        description: Option<String>,
    ) -> Result<ApiKey> {
        #[derive(Serialize)]
        struct B {
            id: String,
            name: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            description: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.apikey.updateApikey",
                None::<&()>,
                Some(&B {
                    id: api_key_id.into(),
                    name: name.into(),
                    description,
                }),
                true,
            )
            .await
    }

    /// Remove an API key by id.
    pub async fn remove(&self, api_key_id: impl Into<String>) -> Result<ApiKey> {
        #[derive(Serialize)]
        struct P {
            id: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.apikey.removeApikey",
                Some(&P {
                    id: api_key_id.into(),
                }),
                None::<&()>,
                true,
            )
            .await
    }
}

#[derive(Debug, Serialize)]
struct Page {
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug)]
pub struct ListApikeys<'a> {
    client: &'a Client,
    params: Page,
}

impl<'a> ListApikeys<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<ApiKey>> {
        let value: Value = self
            .client
            .query_as("app.rocksky.apikey.getApikeys", &self.params, true)
            .await?;
        // The endpoint may return a bare array or an envelope; tolerate either.
        if let Value::Array(items) = &value {
            return Ok(items
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect());
        }
        let env: ApikeysEnvelope = serde_json::from_value(value).unwrap_or_default();
        Ok(env.api_keys)
    }
}
