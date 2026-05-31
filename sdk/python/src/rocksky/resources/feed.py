"""``app.rocksky.feed.*`` — feeds, recommendations, search, stories."""

from __future__ import annotations

from ..models import (
    Feed,
    FeedGenerator,
    Recommendations,
    RecommendedAlbum,
    RecommendedArtist,
    SearchResults,
    Story,
)
from ._base import Resource, parse_list, parse_model


class FeedResource(Resource):
    async def get(
        self,
        feed: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
    ) -> Feed:
        """Fetch posts from a feed generator URI."""
        data = await self._transport.query(
            "app.rocksky.feed.getFeed",
            params={"feed": feed, "limit": limit, "cursor": cursor},
        )
        return parse_model(Feed, data)

    async def get_generator(self, feed: str) -> FeedGenerator:
        data = await self._transport.query(
            "app.rocksky.feed.getFeedGenerator", params={"feed": feed}
        )
        return parse_model(FeedGenerator, data)

    async def list_generators(self, *, size: int | None = None) -> list[FeedGenerator]:
        data = await self._transport.query(
            "app.rocksky.feed.getFeedGenerators", params={"size": size}
        )
        return parse_list(FeedGenerator, data, key="feeds")

    async def search(self, query: str) -> SearchResults:
        data = await self._transport.query(
            "app.rocksky.feed.search", params={"query": query}
        )
        return parse_model(SearchResults, data)

    async def stories(self, *, size: int | None = None) -> list[Story]:
        data = await self._transport.query(
            "app.rocksky.feed.getStories", params={"size": size}
        )
        return parse_list(Story, data, key="stories")

    async def recommendations(
        self,
        did: str,
        *,
        limit: int | None = None,
    ) -> Recommendations:
        data = await self._transport.query(
            "app.rocksky.feed.getRecommendations",
            params={"did": did, "limit": limit},
        )
        return parse_model(Recommendations, data)

    async def artist_recommendations(
        self,
        did: str,
        *,
        limit: int | None = None,
    ) -> list[RecommendedArtist]:
        data = await self._transport.query(
            "app.rocksky.feed.getArtistRecommendations",
            params={"did": did, "limit": limit},
        )
        return parse_list(RecommendedArtist, data, key="artists")

    async def album_recommendations(
        self,
        did: str,
        *,
        limit: int | None = None,
    ) -> list[RecommendedAlbum]:
        data = await self._transport.query(
            "app.rocksky.feed.getAlbumRecommendations",
            params={"did": did, "limit": limit},
        )
        return parse_list(RecommendedAlbum, data, key="albums")
