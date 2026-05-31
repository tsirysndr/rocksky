//! `app.rocksky.like.*` — like / dislike songs and shouts.

use serde::Serialize;
use serde_json::Value;

use crate::client::Client;
use crate::error::Result;

#[derive(Debug)]
pub struct LikeApi<'a> {
    client: &'a Client,
}

impl<'a> LikeApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    pub async fn like_song(&self, uri: impl Into<String>) -> Result<Value> {
        self.toggle("app.rocksky.like.likeSong", uri.into()).await
    }
    pub async fn dislike_song(&self, uri: impl Into<String>) -> Result<Value> {
        self.toggle("app.rocksky.like.dislikeSong", uri.into()).await
    }
    pub async fn like_shout(&self, uri: impl Into<String>) -> Result<Value> {
        self.toggle("app.rocksky.like.likeShout", uri.into()).await
    }
    pub async fn dislike_shout(&self, uri: impl Into<String>) -> Result<Value> {
        self.toggle("app.rocksky.like.dislikeShout", uri.into()).await
    }

    async fn toggle(&self, method: &str, uri: String) -> Result<Value> {
        #[derive(Serialize)]
        struct B {
            uri: String,
        }
        self.client
            .procedure_as(method, None::<&()>, Some(&B { uri }), true)
            .await
    }
}
