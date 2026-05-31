"""Song resource tests."""

from __future__ import annotations

import httpx
import respx

from rocksky import Client, Song


@respx.mock
async def test_get_song_by_uri(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "id": "song1",
        "title": "Running Up That Hill",
        "artist": "Kate Bush",
        "playCount": 10,
        "artists": [{"id": "a", "name": "Kate Bush", "uri": "at://artist"}],
        "firstScrobble": {
            "handle": "alice.bsky.social",
            "avatar": "https://example.test/a.jpg",
            "timestamp": "2024-01-01T00:00:00Z",
        },
    }
    route = mock_api.get("/xrpc/app.rocksky.song.getSong").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        song = await c.song.get(uri="at://song1")
    assert isinstance(song, Song)
    assert song.play_count == 10
    assert song.first_scrobble is not None
    assert song.first_scrobble.handle == "alice.bsky.social"
    assert route.calls.last.request.url.params["uri"] == "at://song1"


@respx.mock
async def test_get_song_by_mbid(mock_api: respx.Router, base_url: str) -> None:
    route = mock_api.get("/xrpc/app.rocksky.song.getSong").mock(
        return_value=httpx.Response(200, json={})
    )
    async with Client(base_url=base_url) as c:
        await c.song.get(mbid="abc-123")
    params = route.calls.last.request.url.params
    assert "mbid" in params
    assert "uri" not in params  # None values dropped


@respx.mock
async def test_match_song(mock_api: respx.Router, base_url: str) -> None:
    payload = {"id": "x", "title": "Hounds of Love", "artist": "Kate Bush"}
    mock_api.get("/xrpc/app.rocksky.song.matchSong").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        song = await c.song.match("Hounds of Love", "Kate Bush", isrc="ABCDE12345678")
    assert song.title == "Hounds of Love"


@respx.mock
async def test_recent_listeners(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "listeners": [
            {
                "id": "u1",
                "did": "did:plc:abc",
                "handle": "alice.bsky.social",
                "timestamp": "2026-05-30T12:00:00Z",
            }
        ]
    }
    mock_api.get("/xrpc/app.rocksky.song.getSongRecentListeners").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        listeners = await c.song.get_recent_listeners("at://x", limit=5)
    assert len(listeners) == 1
    assert listeners[0].handle == "alice.bsky.social"
