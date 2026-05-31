"""Feed resource tests."""

from __future__ import annotations

import httpx
import respx

from rocksky import Client


@respx.mock
async def test_search(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "hits": [
            {"title": "Heaven", "artist": "BMTH"},
            {"name": "Bring Me The Horizon", "uri": "at://artist"},
        ],
        "processingTimeMs": 4,
        "limit": 20,
        "estimatedTotalHits": 2,
    }
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        results = await c.feed.search("bmth")
    assert results.processing_time_ms == 4
    assert results.estimated_total_hits == 2
    assert len(results.hits) == 2


@respx.mock
async def test_get_feed_with_cursor(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "feed": [{"scrobble": {"id": "s1", "title": "x", "artist": "y"}}],
        "cursor": "page2",
    }
    route = mock_api.get("/xrpc/app.rocksky.feed.getFeed").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        feed = await c.feed.get("at://feed/all", limit=10, cursor="page1")
    assert feed.cursor == "page2"
    assert len(feed.feed) == 1
    assert feed.feed[0].scrobble is not None
    assert feed.feed[0].scrobble.id == "s1"
    params = route.calls.last.request.url.params
    assert params["feed"] == "at://feed/all"
    assert params["cursor"] == "page1"


@respx.mock
async def test_stories(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "stories": [
            {
                "id": "st1",
                "handle": "alice.bsky.social",
                "title": "Hounds of Love",
                "artist": "Kate Bush",
            }
        ]
    }
    mock_api.get("/xrpc/app.rocksky.feed.getStories").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        stories = await c.feed.stories(size=10)
    assert len(stories) == 1
    assert stories[0].artist == "Kate Bush"


@respx.mock
async def test_recommendations(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "recommendations": [
            {
                "title": "Heaven",
                "artist": "BMTH",
                "recommendationScore": 95,
                "source": "neighbour",
            }
        ],
        "cursor": "next",
    }
    mock_api.get("/xrpc/app.rocksky.feed.getRecommendations").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        recs = await c.feed.recommendations("did:plc:abc", limit=10)
    assert recs.cursor == "next"
    assert recs.recommendations[0].recommendation_score == 95
