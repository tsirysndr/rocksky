"""Retries + request/response hook tests."""

from __future__ import annotations

import asyncio

import httpx
import pytest
import respx

from rocksky import Client, ClientBuilder, ServerError, TransportError


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch: pytest.MonkeyPatch) -> None:
    """Backoff sleeps slow tests down for no useful signal — skip them."""

    async def _instant(_: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", _instant)


@respx.mock
async def test_retries_on_5xx_then_succeeds(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        side_effect=[
            httpx.Response(503, text="upstream down"),
            httpx.Response(502, text="bad gateway"),
            httpx.Response(200, json={"hits": []}),
        ]
    )
    client = ClientBuilder().base_url(base_url).retries(3, backoff=0).build()
    try:
        result = await client.feed.search("x")
    finally:
        await client.aclose()
    assert result.hits == []
    assert route.call_count == 3


@respx.mock
async def test_retries_eventually_give_up(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(500, json={"error": "X", "message": "boom"})
    )
    client = ClientBuilder().base_url(base_url).retries(2).build()
    try:
        with pytest.raises(ServerError):
            await client.feed.search("x")
    finally:
        await client.aclose()
    # initial + 2 retries = 3 attempts
    assert route.call_count == 3


@respx.mock
async def test_4xx_is_not_retried(mock_api: respx.Router, base_url: str) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(404, json={"error": "X", "message": "not here"})
    )
    client = ClientBuilder().base_url(base_url).retries(5).build()
    try:
        from rocksky import NotFoundError

        with pytest.raises(NotFoundError):
            await client.feed.search("x")
    finally:
        await client.aclose()
    assert route.call_count == 1


@respx.mock
async def test_transport_error_is_retried(
    mock_api: respx.Router, base_url: str
) -> None:
    route = mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        side_effect=[
            httpx.ConnectError("boom"),
            httpx.ConnectError("boom"),
            httpx.Response(200, json={"hits": []}),
        ]
    )
    client = ClientBuilder().base_url(base_url).retries(3).build()
    try:
        result = await client.feed.search("x")
    finally:
        await client.aclose()
    assert result is not None
    assert route.call_count == 3


@respx.mock
async def test_transport_error_after_retries_raises_transport_error(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        side_effect=httpx.ConnectError("boom")
    )
    client = ClientBuilder().base_url(base_url).retries(1).build()
    try:
        with pytest.raises(TransportError):
            await client.feed.search("x")
    finally:
        await client.aclose()


@respx.mock
async def test_request_hook_runs_before_each_attempt(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        side_effect=[
            httpx.Response(500, text="oops"),
            httpx.Response(200, json={"hits": []}),
        ]
    )
    seen: list[str] = []
    client = (
        ClientBuilder()
        .base_url(base_url)
        .retries(2)
        .on_request(lambda req: seen.append(req.url.path))
        .build()
    )
    try:
        await client.feed.search("x")
    finally:
        await client.aclose()
    # one entry per attempt
    assert seen == [
        "/xrpc/app.rocksky.feed.search",
        "/xrpc/app.rocksky.feed.search",
    ]


@respx.mock
async def test_async_hooks_are_awaited(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    log: list[tuple[str, int | str]] = []

    async def on_req(req: httpx.Request) -> None:
        log.append(("req", req.method))

    async def on_res(res: httpx.Response) -> None:
        log.append(("res", res.status_code))

    client = (
        ClientBuilder()
        .base_url(base_url)
        .on_request(on_req)
        .on_response(on_res)
        .build()
    )
    try:
        await client.feed.search("x")
    finally:
        await client.aclose()
    assert log == [("req", "GET"), ("res", 200)]


@respx.mock
async def test_response_hook_can_inspect_status(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.feed.search").mock(
        return_value=httpx.Response(200, json={"hits": []})
    )
    statuses: list[int] = []
    client = Client(
        base_url=base_url, response_hooks=[lambda r: statuses.append(r.status_code)]
    )
    try:
        await client.feed.search("x")
    finally:
        await client.aclose()
    assert statuses == [200]
