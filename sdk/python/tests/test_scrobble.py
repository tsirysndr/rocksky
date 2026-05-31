"""Scrobble resource tests — covers list, get, and create."""

from __future__ import annotations

import json

import httpx
import respx

from rocksky import Client, Scrobble


@respx.mock
async def test_list_scrobbles(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "scrobbles": [
            {
                "id": "s1",
                "user": "alice.bsky.social",
                "title": "Heaven",
                "artist": "Bring Me The Horizon",
                "date": "2026-05-30T12:00:00Z",
                "likesCount": 3,
                "liked": True,
            }
        ]
    }
    mock_api.get("/xrpc/app.rocksky.scrobble.getScrobbles").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        items = await c.scrobble.list(did="did:plc:abc", limit=5)
    assert len(items) == 1
    s = items[0]
    assert isinstance(s, Scrobble)
    assert s.likes_count == 3
    assert s.liked is True
    assert s.user == "alice.bsky.social"


@respx.mock
async def test_list_with_following_requires_auth(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.scrobble.getScrobbles").mock(
        return_value=httpx.Response(200, json={"scrobbles": []})
    )
    async with Client(base_url=base_url, token="tok") as c:
        await c.scrobble.list(following=True)
    sent = route.calls.last.request
    assert sent.headers["authorization"] == "Bearer tok"
    # Booleans should be serialized as "true"/"false" strings.
    assert sent.url.params["following"] == "true"


@respx.mock
async def test_get_scrobble(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "id": "s1",
        "title": "Sk8er Boi",
        "artist": "Avril Lavigne",
        "scrobbles": 12,
        "listeners": 4,
        "artists": [{"id": "ar1", "name": "Avril Lavigne", "uri": "at://artist"}],
    }
    mock_api.get("/xrpc/app.rocksky.scrobble.getScrobble").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        scrobble = await c.scrobble.get("at://scrobble1")
    assert scrobble.scrobbles == 12
    assert scrobble.artists is not None
    assert scrobble.artists[0].name == "Avril Lavigne"


@respx.mock
async def test_create_scrobble_omits_none_fields(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.post("/xrpc/app.rocksky.scrobble.createScrobble").mock(
        return_value=httpx.Response(200, json={})
    )
    async with Client(base_url=base_url, token="tok") as c:
        await c.scrobble.create(
            title="Hounds of Love",
            artist="Kate Bush",
            album="Hounds of Love",
            duration=180000,
            timestamp=1717000000,
        )
    body = json.loads(route.calls.last.request.read())
    assert body == {
        "title": "Hounds of Love",
        "artist": "Kate Bush",
        "album": "Hounds of Love",
        "duration": 180000,
        "timestamp": 1717000000,
    }
    assert "mbId" not in body
