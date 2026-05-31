"""Status-code → exception-type mapping."""

from __future__ import annotations

import httpx
import pytest
import respx

from rocksky import (
    APIError,
    AuthenticationError,
    Client,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ServerError,
    TransportError,
)


@pytest.mark.parametrize(
    "status,exc_cls",
    [
        (401, AuthenticationError),
        (403, PermissionError),
        (404, NotFoundError),
        (429, RateLimitError),
        (500, ServerError),
        (503, ServerError),
        (400, APIError),
    ],
)
@respx.mock
async def test_status_code_maps_to_exception(
    mock_api: respx.Router, base_url: str, status: int, exc_cls: type
) -> None:
    mock_api.get("/xrpc/app.rocksky.song.getSong").mock(
        return_value=httpx.Response(status, json={"error": "X", "message": "boom"})
    )
    async with Client(base_url=base_url) as c:
        with pytest.raises(exc_cls) as exc_info:
            await c.song.get(uri="at://x")
    err = exc_info.value
    assert err.status_code == status
    assert err.error == "X"
    assert err.message == "boom"
    assert err.method == "app.rocksky.song.getSong"


@respx.mock
async def test_text_error_body(mock_api: respx.Router, base_url: str) -> None:
    mock_api.get("/xrpc/app.rocksky.song.getSong").mock(
        return_value=httpx.Response(502, text="Bad Gateway")
    )
    async with Client(base_url=base_url) as c:
        with pytest.raises(ServerError) as exc_info:
            await c.song.get(uri="at://x")
    assert exc_info.value.body == "Bad Gateway"


@respx.mock
async def test_network_error_is_transport_error(
    mock_api: respx.Router, base_url: str
) -> None:
    mock_api.get("/xrpc/app.rocksky.song.getSong").mock(
        side_effect=httpx.ConnectError("boom")
    )
    async with Client(base_url=base_url) as c:
        with pytest.raises(TransportError):
            await c.song.get(uri="at://x")


async def test_missing_token_raises_authentication_error() -> None:
    async with Client(base_url="https://api.test.invalid") as c:
        with pytest.raises(AuthenticationError):
            await c.shout.create("hi")
