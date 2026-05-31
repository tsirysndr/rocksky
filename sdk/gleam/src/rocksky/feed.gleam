//// `app.rocksky.feed.*` — feeds, recommendations and search.

import gleam/dynamic.{type Dynamic}
import gleam/dynamic/decode
import rocksky.{type Request}

/// `app.rocksky.feed.getFeed` — fetch a feed by id with cursor pagination.
pub fn get_feed(feed feed: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getFeed", decode.dynamic)
  |> rocksky.param("feed", feed)
}

/// `app.rocksky.feed.getFeedGenerators` — list available feed generators.
pub fn get_feed_generators() -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getFeedGenerators", decode.dynamic)
}

/// `app.rocksky.feed.getFeedGenerator` — fetch a single feed generator.
pub fn get_feed_generator(feed feed: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getFeedGenerator", decode.dynamic)
  |> rocksky.param("feed", feed)
}

/// `app.rocksky.feed.getRecommendations` — recommended tracks for an actor.
pub fn get_recommendations(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getRecommendations", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.feed.getArtistRecommendations` — recommended artists.
pub fn get_artist_recommendations(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getArtistRecommendations", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.feed.getAlbumRecommendations` — recommended albums.
pub fn get_album_recommendations(did did: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getAlbumRecommendations", decode.dynamic)
  |> rocksky.param("did", did)
}

/// `app.rocksky.feed.getStories` — current stories panel.
pub fn get_stories() -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.getStories", decode.dynamic)
}

/// `app.rocksky.feed.search` — full-text search across artists, albums, tracks.
pub fn search(q query_text: String) -> Request(Dynamic) {
  rocksky.query("app.rocksky.feed.search", decode.dynamic)
  |> rocksky.param("query", query_text)
}
