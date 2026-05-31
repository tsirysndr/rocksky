//! `app.rocksky.shout.*` — shoutbox.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::{Shout, ShoutsEnvelope};

#[derive(Debug)]
pub struct ShoutApi<'a> {
    client: &'a Client,
}

impl<'a> ShoutApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Create a shout on the authenticated user's profile.
    pub async fn create(&self, message: impl Into<String>) -> Result<Shout> {
        #[derive(Serialize)]
        struct B {
            message: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.shout.createShout",
                None::<&()>,
                Some(&B {
                    message: message.into(),
                }),
                true,
            )
            .await
    }

    /// Reply to a shout.
    pub async fn reply(
        &self,
        shout_id: impl Into<String>,
        message: impl Into<String>,
    ) -> Result<Shout> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct B {
            shout_id: String,
            message: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.shout.replyShout",
                None::<&()>,
                Some(&B {
                    shout_id: shout_id.into(),
                    message: message.into(),
                }),
                true,
            )
            .await
    }

    /// Remove a shout by id. Requires auth.
    pub async fn remove(&self, shout_id: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            id: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.shout.removeShout",
                Some(&P {
                    id: shout_id.into(),
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Report a shout.
    pub async fn report(
        &self,
        shout_id: impl Into<String>,
        reason: Option<String>,
    ) -> Result<Value> {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct B {
            shout_id: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            reason: Option<String>,
        }
        self.client
            .procedure_as(
                "app.rocksky.shout.reportShout",
                None::<&()>,
                Some(&B {
                    shout_id: shout_id.into(),
                    reason,
                }),
                true,
            )
            .await
    }

    /// Shouts on a profile.
    pub fn for_profile(&self, did: impl Into<String>) -> ShoutsForDid<'_> {
        ShoutsForDid {
            client: self.client,
            method: "app.rocksky.shout.getProfileShouts",
            params: DidPage {
                did: did.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Shouts on an album.
    pub fn for_album(&self, uri: impl Into<String>) -> ShoutsForUri<'_> {
        ShoutsForUri {
            client: self.client,
            method: "app.rocksky.shout.getAlbumShouts",
            params: UriPage {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Shouts on an artist.
    pub fn for_artist(&self, uri: impl Into<String>) -> ShoutsForUri<'_> {
        ShoutsForUri {
            client: self.client,
            method: "app.rocksky.shout.getArtistShouts",
            params: UriPage {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }

    /// Shouts on a track.
    pub async fn for_track(&self, uri: impl Into<String>) -> Result<Vec<Shout>> {
        #[derive(Serialize)]
        struct P {
            uri: String,
        }
        let env: ShoutsEnvelope = self
            .client
            .query_as(
                "app.rocksky.shout.getTrackShouts",
                &P { uri: uri.into() },
                false,
            )
            .await?;
        Ok(env.shouts)
    }

    /// Replies to a shout.
    pub fn replies(&self, uri: impl Into<String>) -> ShoutsForUri<'_> {
        ShoutsForUri {
            client: self.client,
            method: "app.rocksky.shout.getShoutReplies",
            params: UriPage {
                uri: uri.into(),
                limit: None,
                offset: None,
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct DidPage {
    did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug, Serialize)]
struct UriPage {
    uri: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<u32>,
}

#[derive(Debug)]
pub struct ShoutsForDid<'a> {
    client: &'a Client,
    method: &'static str,
    params: DidPage,
}

impl<'a> ShoutsForDid<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<Shout>> {
        let env: ShoutsEnvelope = self
            .client
            .query_as(self.method, &self.params, false)
            .await?;
        Ok(env.shouts)
    }
}

#[derive(Debug)]
pub struct ShoutsForUri<'a> {
    client: &'a Client,
    method: &'static str,
    params: UriPage,
}

impl<'a> ShoutsForUri<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn offset(mut self, offset: u32) -> Self {
        self.params.offset = Some(offset);
        self
    }
    pub async fn send(self) -> Result<Vec<Shout>> {
        let env: ShoutsEnvelope = self
            .client
            .query_as(self.method, &self.params, false)
            .await?;
        Ok(env.shouts)
    }
}
