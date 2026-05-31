"""ClientBuilder tests."""

from __future__ import annotations

import httpx
import pytest
import respx

from rocksky import Client, ClientBuilder


def test_builder_records_configuration() -> None:
    builder = (
        ClientBuilder()
        .base_url("https://api.test.invalid")
        .token("tok")
        .timeout(7.5)
        .user_agent("my-app/1.0")
        .header("x-request-id", "abc")
        .headers({"x-trace": "1"})
        .retries(3, backoff=0.25)
        .on_request(lambda req: None)
        .on_response(lambda res: None)
    )

    snapshot = builder.as_dict()
    assert snapshot["token"] == "tok"
    assert snapshot["base_url"] == "https://api.test.invalid"
    assert snapshot["timeout"] == 7.5
    assert snapshot["user_agent"] == "my-app/1.0"
    assert snapshot["headers"] == {"x-request-id": "abc", "x-trace": "1"}
    assert snapshot["retries"] == 3
    assert snapshot["retry_backoff"] == 0.25
    assert snapshot["request_hook_count"] == 1
    assert snapshot["response_hook_count"] == 1


def test_builder_setters_return_self() -> None:
    """Every setter must return ``self`` so chaining works."""
    b = ClientBuilder()
    assert b.token("x") is b
    assert b.base_url("https://x").is_(b) if False else b.base_url("https://x") is b
    assert b.timeout(1.0) is b
    assert b.header("a", "b") is b
    assert b.headers({"c": "d"}) is b
    assert b.user_agent("ua") is b
    assert b.retries(0) is b
    assert b.on_request(lambda r: None) is b
    assert b.on_response(lambda r: None) is b


def test_builder_rejects_negative_retries() -> None:
    with pytest.raises(ValueError):
        ClientBuilder().retries(-1)


def test_client_builder_shortcut_on_client() -> None:
    b = Client.builder()
    assert isinstance(b, ClientBuilder)


@respx.mock
async def test_builder_built_client_works(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    client = ClientBuilder().base_url(base_url).token("tok").build()
    try:
        await client.feed.search("anything")
    finally:
        await client.aclose()

    assert route.called
    assert client.token == "tok"
    assert client.base_url == base_url


@respx.mock
async def test_builder_header_lands_on_request(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    client = (
        ClientBuilder()
        .base_url(base_url)
        .header("x-request-id", "trace-123")
        .build()
    )
    try:
        await client.feed.search("x")
    finally:
        await client.aclose()
    assert route.calls.last.request.headers["x-request-id"] == "trace-123"


@respx.mock
async def test_builder_user_agent_override(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    client = ClientBuilder().base_url(base_url).user_agent("custom-app/2.0").build()
    try:
        await client.feed.search("x")
    finally:
        await client.aclose()
    assert route.calls.last.request.headers["user-agent"] == "custom-app/2.0"


async def test_builder_with_external_http_client_does_not_close() -> None:
    external = httpx.AsyncClient()
    try:
        client = ClientBuilder().http_client(external).build()
        await client.aclose()
        # External should still be usable — `_owns_client` is False.
        assert not external.is_closed
    finally:
        await external.aclose()
