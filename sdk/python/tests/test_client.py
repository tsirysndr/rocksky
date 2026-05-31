"""Smoke tests for the Client wiring and the call() escape hatch."""

from __future__ import annotations

import httpx
import pytest
import respx

from rocksky import Client


async def test_client_initializes_resources() -> None:
    async with Client(base_url="https://api.test.invalid") as c:
        for name in (
            "actor",
            "album",
            "apikey",
            "artist",
            "charts",
            "dropbox",
            "feed",
            "googledrive",
            "graph",
            "like",
            "mirror",
            "player",
            "playlist",
            "scrobble",
            "shout",
            "song",
            "spotify",
            "stats",
        ):
            assert hasattr(c, name), f"missing resource: {name}"


async def test_set_token_propagates() -> None:
    async with Client(base_url="https://api.test.invalid") as c:
        assert c.token is None
        c.set_token("abc")
        assert c.token == "abc"
        c.set_token(None)
        assert c.token is None


@respx.mock
async def test_call_query(mock_api: respx.Router, base_url: str) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.describeFeedGenerator").mock(
        return_value=httpx.Response(200, json={"did": "did:plc:abc"})
    )
    async with Client(base_url=base_url) as c:
        result = await c.call("app.rocksky.feed.describeFeedGenerator")
    assert result == {"did": "did:plc:abc"}


@respx.mock
async def test_call_procedure_sends_json_and_auth(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.post("/xrpc/app.rocksky.shout.createShout").mock(
        return_value=httpx.Response(200, json={"id": "shout1"})
    )
    async with Client(base_url=base_url, token="tok") as c:
        result = await c.call(
            "app.rocksky.shout.createShout",
            verb="POST",
            body={"message": "hi"},
            auth=True,
        )
    assert result == {"id": "shout1"}
    sent = route.calls.last.request
    assert sent.headers["authorization"] == "Bearer tok"
    assert sent.read() == b'{"message":"hi"}'


@respx.mock
async def test_external_http_client_is_not_closed(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    external = httpx.AsyncClient()
    try:
        async with Client(base_url=base_url, http_client=external) as c:
            await c.call("app.rocksky.feed.search", params={"query": "x"})
        # If the client wrongly aclose()d the external httpx instance, this
        # next request would raise RuntimeError("Cannot send a request, …
        # has been closed").
        await external.get("https://api.test.invalid/xrpc/app.rocksky.feed.search?query=y")
    finally:
        await external.aclose()


async def test_procedure_without_token_raises() -> None:
    async with Client(base_url="https://api.test.invalid") as c:
        with pytest.raises(Exception) as exc_info:
            await c.scrobble.create(title="t", artist="a")
        assert "auth" in str(exc_info.value).lower() or "token" in str(exc_info.value).lower()
