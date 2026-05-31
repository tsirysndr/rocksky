//! `app.rocksky.stats.*` — stats and Wrapped.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;

#[derive(Debug)]
pub struct StatsApi<'a> {
    client: &'a Client,
}

impl<'a> StatsApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Aggregate listening stats for an actor. Returns the raw JSON shape
    /// (server-side schema still evolving).
    pub async fn get(&self, did: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            did: String,
        }
        self.client
            .call_with("app.rocksky.stats.getStats", &P { did: did.into() }, false)
            .await
    }

    /// Year-in-review payload. `year` defaults to the most recent completed
    /// year on the server.
    pub async fn wrapped(&self, did: impl Into<String>, year: Option<i32>) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct P {
            did: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            year: Option<i32>,
        }
        self.client
            .call_with(
                "app.rocksky.stats.getWrapped",
                &P {
                    did: did.into(),
                    year,
                },
                false,
            )
            .await
    }
}
