"""API key resource tests."""

from __future__ import annotations

import json

import httpx
import respx

from rocksky import ApiKey, Client


@respx.mock
async def test_create_apikey(mock_api: respx.Router, base_url: str) -> None:
    route = mock_api.post("/xrpc/app.rocksky.apikey.createApikey").mock(
        return_value=httpx.Response(
            200,
            json={
                "id": "k1",
                "name": "ci",
                "description": "CI bot",
                "apiKey": "abcdef",
                "sharedSecret": "deadbeef",
            },
        )
    )
    async with Client(base_url=base_url, token="tok") as c:
        key = await c.apikey.create("ci", description="CI bot")
    assert isinstance(key, ApiKey)
    assert key.api_key == "abcdef"
    assert key.shared_secret == "deadbeef"
    body = json.loads(route.calls.last.request.read())
    assert body == {"name": "ci", "description": "CI bot"}


@respx.mock
async def test_list_apikeys_handles_list_or_wrapped(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.apikey.getApikeys").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"id": "k1", "name": "one", "apiKey": "x"},
                {"id": "k2", "name": "two", "apiKey": "y"},
            ],
        )
    )
    async with Client(base_url=base_url, token="tok") as c:
        keys = await c.apikey.list()
    assert [k.name for k in keys] == ["one", "two"]


@respx.mock
async def test_remove_apikey_via_query_params(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.post("/xrpc/app.rocksky.apikey.removeApikey").mock(
        return_value=httpx.Response(200, json={"id": "k1", "name": "ci"})
    )
    async with Client(base_url=base_url, token="tok") as c:
        result = await c.apikey.remove("k1")
    assert result.id == "k1"
    # removeApikey is a POST with `id` in the query string per the lexicon.
    assert route.calls.last.request.url.params["id"] == "k1"
