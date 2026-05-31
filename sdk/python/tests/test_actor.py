"""Actor resource tests."""

from __future__ import annotations

import httpx
import respx

from rocksky import Client, Profile

PROFILE = {
    "id": "u1",
    "did": "did:plc:abc",
    "handle": "alice.bsky.social",
    "displayName": "Alice",
    "avatar": "https://example.test/a.jpg",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-06-01T00:00:00Z",
    "spotifyConnected": True,
}


@respx.mock
async def test_get_profile(mock_api: respx.Router, base_url: str) -> None:
    route = mock_api.get("/xrpc/app.rocksky.actor.getProfile").mock(
        return_value=httpx.Response(200, json=PROFILE)
    )
    async with Client(base_url=base_url) as c:
        profile = await c.actor.get_profile("alice.bsky.social")
    assert isinstance(profile, Profile)
    assert profile.handle == "alice.bsky.social"
    assert profile.spotify_connected is True
    assert profile.display_name == "Alice"
    # Sent as `?did=alice.bsky.social` per the lexicon.
    assert route.calls.last.request.url.params["did"] == "alice.bsky.social"


@respx.mock
async def test_get_profile_self_requires_auth(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.actor.getProfile").mock(
        return_value=httpx.Response(200, json=PROFILE)
    )
    async with Client(base_url=base_url, token="tok") as c:
        await c.actor.get_profile()
    assert route.calls.last.request.headers["authorization"] == "Bearer tok"


@respx.mock
async def test_get_actor_albums(mock_api: respx.Router, base_url: str) -> None:
    payload = {
        "albums": [
            {"id": "a1", "title": "Hounds", "artist": "Kate Bush"},
            {"id": "a2", "title": "Aerial", "artist": "Kate Bush"},
        ]
    }
    mock_api.get("/xrpc/app.rocksky.actor.getActorAlbums").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        albums = await c.actor.get_albums("did:plc:abc", limit=10)
    assert [a.title for a in albums] == ["Hounds", "Aerial"]


@respx.mock
async def test_get_actor_scrobbles_with_pagination(
    mock_api: respx.Router, base_url: str
) -> None:
    payload = {"scrobbles": [{"id": "s1", "title": "Wuthering Heights"}]}
    route = mock_api.get("/xrpc/app.rocksky.actor.getActorScrobbles").mock(
        return_value=httpx.Response(200, json=payload)
    )
    async with Client(base_url=base_url) as c:
        scrobbles = await c.actor.get_scrobbles("did:plc:abc", limit=1, offset=20)
    assert len(scrobbles) == 1
    params = route.calls.last.request.url.params
    assert params["limit"] == "1"
    assert params["offset"] == "20"
    assert params["did"] == "did:plc:abc"


@respx.mock
async def test_empty_response_is_safe(mock_api: respx.Router, base_url: str) -> None:
    mock_api.get("/xrpc/app.rocksky.actor.getActorAlbums").mock(
        return_value=httpx.Response(200, json={})
    )
    async with Client(base_url=base_url) as c:
        albums = await c.actor.get_albums("did:plc:abc")
    assert albums == []
