"""Shared fixtures for the Rocksky SDK test suite."""

from __future__ import annotations

import pytest
import respx

from rocksky import Client

BASE_URL = "https://api.test.invalid"


@pytest.fixture
def base_url() -> str:
    return BASE_URL


@pytest.fixture
async def client() -> Client:
    """Unauthenticated client pointed at the mock base URL."""
    async with Client(base_url=BASE_URL) as c:
        yield c


@pytest.fixture
async def auth_client() -> Client:
    """Client with a fake bearer token."""
    async with Client(base_url=BASE_URL, token="test-token") as c:
        yield c


@pytest.fixture
def mock_api(base_url: str) -> respx.Router:
    """Respx mock router scoped to the SDK's base URL."""
    with respx.mock(assert_all_called=False, base_url=base_url) as router:
        yield router
