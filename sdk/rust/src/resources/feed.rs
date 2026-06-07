//! `app.rocksky.feed.*` — feeds, recommendations, search, stories.

use serde::Serialize;

use crate::client::Client;
use crate::error::Result;
use crate::models::{
    Feed, FeedGenerator, FeedGeneratorsEnvelope, Recommendations, RecommendedAlbum,
    RecommendedAlbumsEnvelope, RecommendedArtist, RecommendedArtistsEnvelope, SearchResults,
    StoriesEnvelope, Story,
};

#[derive(Debug)]
pub struct FeedApi<'a> {
    client: &'a Client,
}

impl<'a> FeedApi<'a> {
    pub(crate) fn new(client: &'a Client) -> Self {
        Self { client }
    }

    /// Get a feed by generator URI.
    pub fn get(&self, feed: impl Into<String>) -> GetFeed<'_> {
        GetFeed {
            client: self.client,
            params: GetFeedParams {
                feed: feed.into(),
                limit: None,
                cursor: None,
            },
        }
    }

    /// Look up a single feed generator.
    pub async fn get_generator(&self, feed: impl Into<String>) -> Result<FeedGenerator> {
        #[derive(Serialize)]
        struct P {
            feed: String,
        }
        self.client
            .query_as(
                "app.rocksky.feed.getFeedGenerator",
                &P { feed: feed.into() },
                false,
            )
            .await
    }

    /// List available feed generators.
    pub fn list_generators(&self) -> ListFeedGenerators<'_> {
        ListFeedGenerators {
            client: self.client,
            params: SizeParams { size: None },
        }
    }

    /// Full-text search across the catalog.
    pub async fn search(&self, query: impl Into<String>) -> Result<SearchResults> {
        #[derive(Serialize)]
        struct P {
            query: String,
        }
        self.client
            .query_as(
                "app.rocksky.feed.search",
                &P {
                    query: query.into(),
                },
                false,
            )
            .await
    }

    /// "Stories" — latest scrobble per user, optionally filtered by feed or
    /// restricted to users the viewer follows.
    pub fn stories(&self) -> ListStories<'_> {
        ListStories {
            client: self.client,
            params: ListStoriesParams::default(),
        }
    }

    /// Personalized recommendations.
    pub fn recommendations(&self, did: impl Into<String>) -> GetRecommendations<'_> {
        GetRecommendations {
            client: self.client,
            params: DidLimit {
                did: did.into(),
                limit: None,
            },
        }
    }

    /// Recommended artists.
    pub fn artist_recommendations(&self, did: impl Into<String>) -> GetArtistRecommendations<'_> {
        GetArtistRecommendations {
            client: self.client,
            params: DidLimit {
                did: did.into(),
                limit: None,
            },
        }
    }

    /// Recommended albums.
    pub fn album_recommendations(&self, did: impl Into<String>) -> GetAlbumRecommendations<'_> {
        GetAlbumRecommendations {
            client: self.client,
            params: DidLimit {
                did: did.into(),
                limit: None,
            },
        }
    }
}

#[derive(Debug, Serialize)]
struct GetFeedParams {
    feed: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cursor: Option<String>,
}

#[derive(Debug)]
pub struct GetFeed<'a> {
    client: &'a Client,
    params: GetFeedParams,
}

impl<'a> GetFeed<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub fn cursor(mut self, cursor: impl Into<String>) -> Self {
        self.params.cursor = Some(cursor.into());
        self
    }
    pub async fn send(self) -> Result<Feed> {
        self.client
            .query_as("app.rocksky.feed.getFeed", &self.params, false)
            .await
    }
}

#[derive(Debug, Default, Serialize)]
struct SizeParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u32>,
}

#[derive(Debug)]
pub struct ListFeedGenerators<'a> {
    client: &'a Client,
    params: SizeParams,
}

impl<'a> ListFeedGenerators<'a> {
    pub fn size(mut self, size: u32) -> Self {
        self.params.size = Some(size);
        self
    }
    pub async fn send(self) -> Result<Vec<FeedGenerator>> {
        let env: FeedGeneratorsEnvelope = self
            .client
            .query_as("app.rocksky.feed.getFeedGenerators", &self.params, false)
            .await?;
        Ok(env.feeds)
    }
}

#[derive(Debug, Default, Serialize)]
struct ListStoriesParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    feed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    following: Option<bool>,
}

#[derive(Debug)]
pub struct ListStories<'a> {
    client: &'a Client,
    params: ListStoriesParams,
}

impl<'a> ListStories<'a> {
    pub fn size(mut self, size: u32) -> Self {
        self.params.size = Some(size);
        self
    }
    /// Restrict to scrobbles published into the given feed generator (at-uri).
    pub fn feed(mut self, feed: impl Into<String>) -> Self {
        self.params.feed = Some(feed.into());
        self
    }
    /// Restrict to users the viewer follows. Requires the client to be
    /// authenticated.
    pub fn following(mut self, following: bool) -> Self {
        self.params.following = Some(following);
        self
    }
    pub async fn send(self) -> Result<Vec<Story>> {
        let needs_auth = self.params.following.unwrap_or(false);
        let env: StoriesEnvelope = self
            .client
            .query_as("app.rocksky.feed.getStories", &self.params, needs_auth)
            .await?;
        Ok(env.stories)
    }
}

#[derive(Debug, Serialize)]
struct DidLimit {
    did: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit: Option<u32>,
}

#[derive(Debug)]
pub struct GetRecommendations<'a> {
    client: &'a Client,
    params: DidLimit,
}

impl<'a> GetRecommendations<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub async fn send(self) -> Result<Recommendations> {
        self.client
            .query_as("app.rocksky.feed.getRecommendations", &self.params, false)
            .await
    }
}

#[derive(Debug)]
pub struct GetArtistRecommendations<'a> {
    client: &'a Client,
    params: DidLimit,
}

impl<'a> GetArtistRecommendations<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub async fn send(self) -> Result<Vec<RecommendedArtist>> {
        let env: RecommendedArtistsEnvelope = self
            .client
            .query_as(
                "app.rocksky.feed.getArtistRecommendations",
                &self.params,
                false,
            )
            .await?;
        Ok(env.artists)
    }
}

#[derive(Debug)]
pub struct GetAlbumRecommendations<'a> {
    client: &'a Client,
    params: DidLimit,
}

impl<'a> GetAlbumRecommendations<'a> {
    pub fn limit(mut self, limit: u32) -> Self {
        self.params.limit = Some(limit);
        self
    }
    pub async fn send(self) -> Result<Vec<RecommendedAlbum>> {
        let env: RecommendedAlbumsEnvelope = self
            .client
            .query_as(
                "app.rocksky.feed.getAlbumRecommendations",
                &self.params,
                false,
            )
            .await?;
        Ok(env.albums)
    }
}
