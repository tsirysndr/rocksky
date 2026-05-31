//! `app.rocksky.graph.*` — follow graph.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;
use crate::models::ProfileBasic;

#[derive(Debug)]
pub struct GraphApi<'a> {
    client: &'a Client,
}

impl<'a> GraphApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Follow an account (DID or handle). Requires auth.
    pub async fn follow(&self, account: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            account: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.graph.followAccount",
                Some(&P {
                    account: account.into(),
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Unfollow an account. Requires auth.
    pub async fn unfollow(&self, account: impl Into<String>) -> Result<Value> {
        #[derive(Serialize)]
        struct P {
            account: String,
        }
        self.client
            .procedure_as(
                "app.rocksky.graph.unfollowAccount",
                Some(&P {
                    account: account.into(),
                }),
                None::<&()>,
                true,
            )
            .await
    }

    /// Get followers of an actor.
    pub fn get_followers(&self, actor: impl Into<String>) -> GetFollowers<'_> {
        GetFollowers {
            client: self.client,
            params: FollowParams {
                actor: actor.into(),
                limit: None,
                cursor: None,
                dids: None,
            },
        }
    }

    /// Get accounts the actor follows.
    pub fn get_follows(&self, actor: impl Into<String>) -> GetFollows<'_> {
        GetFollows {
            client: self.client,
            params: FollowParams {
                actor: actor.into(),
                limit: None,
                cursor: None,
                dids: None,
            },
        }
    }

    /// Known followers (intersection with the authed user's graph). Requires auth.
    pub fn get_known_followers(&self, actor: impl Into<String>) -> GetKnownFollowers<'_> {
        GetKnownFollowers {
            client: self.client,
            params: FollowParams {
                actor: actor.into(),
                limit: None,
                cursor: None,
                dids: None,
            },
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FollowParams {
    actor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dids: Option<Vec<String>>,
}

/// Paginated follow list.
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct FollowList {
    /// Subject of the query (target actor).
    pub subject: Option<ProfileBasic>,
    /// Followers (or follows, depending on the call).
    #[serde(alias = "followers", alias = "follows")]
    pub entries: Vec<ProfileBasic>,
    pub cursor: Option<String>,
    pub count: Option<u64>,
}

impl FollowList {
    /// Convenience accessor for iteration.
    pub fn iter(&self) -> std::slice::Iter<'_, ProfileBasic> {
        self.entries.iter()
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

macro_rules! follow_builder {
    ($name:ident, $method:expr, $auth:expr) => {
        #[derive(Debug)]
        pub struct $name<'a> {
            client: &'a Client,
            params: FollowParams,
        }

        impl<'a> $name<'a> {
            pub fn limit(mut self, limit: u32) -> Self {
                self.params.limit = Some(limit);
                self
            }
            pub fn cursor(mut self, cursor: impl Into<String>) -> Self {
                self.params.cursor = Some(cursor.into());
                self
            }
            pub fn dids<I, S>(mut self, dids: I) -> Self
            where
                I: IntoIterator<Item = S>,
                S: Into<String>,
            {
                self.params.dids = Some(dids.into_iter().map(Into::into).collect());
                self
            }
            pub async fn send(self) -> Result<FollowList> {
                self.client
                    .query_as($method, &self.params, $auth)
                    .await
            }
        }
    };
}

follow_builder!(GetFollowers, "app.rocksky.graph.getFollowers", false);
follow_builder!(GetFollows, "app.rocksky.graph.getFollows", false);
follow_builder!(GetKnownFollowers, "app.rocksky.graph.getKnownFollowers", true);
