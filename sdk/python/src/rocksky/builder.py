"""Fluent builder for :class:`rocksky.Client`.

If you prefer chainable configuration over a wide keyword-arg constructor:

    >>> rocksky = (
    ...     ClientBuilder()
    ...     .base_url("https://api.rocksky.app")
    ...     .token(os.environ["ROCKSKY_TOKEN"])
    ...     .timeout(10.0)
    ...     .user_agent("my-app/1.0")
    ...     .header("x-request-id", "abc")
    ...     .retries(3, backoff=0.5)
    ...     .on_request(lambda r: log.debug("→ %s %s", r.method, r.url))
    ...     .on_response(lambda r: log.debug("← %s", r.status_code))
    ...     .build()
    ... )

The builder is mutable — each setter returns ``self``. Call :meth:`build` once
you're done; the returned client may be used as an async context manager.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import httpx

from ._http import (
    DEFAULT_BASE_URL,
    DEFAULT_RETRY_BACKOFF,
    DEFAULT_TIMEOUT,
    RequestHook,
    ResponseHook,
)
from .client import Client

__all__ = ["ClientBuilder"]


class ClientBuilder:
    """Chainable configuration for a :class:`Client`."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._base_url: str = DEFAULT_BASE_URL
        self._timeout: float | httpx.Timeout = DEFAULT_TIMEOUT
        self._headers: dict[str, str] = {}
        self._http_client: httpx.AsyncClient | None = None
        self._user_agent: str | None = None
        self._retries: int = 0
        self._retry_backoff: float = DEFAULT_RETRY_BACKOFF
        self._request_hooks: list[RequestHook] = []
        self._response_hooks: list[ResponseHook] = []

    # --- configuration --------------------------------------------------- #

    def token(self, token: str | None) -> ClientBuilder:
        """Set (or clear) the bearer token."""
        self._token = token
        return self

    def base_url(self, base_url: str) -> ClientBuilder:
        """Override the API base URL (defaults to ``https://api.rocksky.app``)."""
        self._base_url = base_url
        return self

    def timeout(self, timeout: float | httpx.Timeout) -> ClientBuilder:
        """Set the per-request timeout (seconds, or an :class:`httpx.Timeout`)."""
        self._timeout = timeout
        return self

    def header(self, name: str, value: str) -> ClientBuilder:
        """Set a single default header. Repeat or call :meth:`headers` for more."""
        self._headers[name] = value
        return self

    def headers(self, headers: Mapping[str, str]) -> ClientBuilder:
        """Merge in a bag of default headers."""
        self._headers.update(headers)
        return self

    def user_agent(self, user_agent: str) -> ClientBuilder:
        """Override the User-Agent header (default: ``rocksky-python/<version>``)."""
        self._user_agent = user_agent
        return self

    def http_client(self, http_client: httpx.AsyncClient) -> ClientBuilder:
        """Use an externally-owned ``httpx.AsyncClient``.

        The builder's ``timeout``, ``user_agent``, and ``headers`` are ignored
        when this is set — configure them on the httpx client instead. The
        resulting :class:`Client` will *not* close the httpx instance on exit.
        """
        self._http_client = http_client
        return self

    def retries(
        self,
        count: int,
        *,
        backoff: float = DEFAULT_RETRY_BACKOFF,
    ) -> ClientBuilder:
        """Retry transport errors and 5xx responses ``count`` times.

        ``backoff`` is the base delay in seconds; sleeps double on each retry
        (``backoff * 2**attempt``). Set ``count=0`` to disable.
        """
        if count < 0:
            raise ValueError("retries must be >= 0")
        self._retries = count
        self._retry_backoff = backoff
        return self

    def on_request(self, hook: RequestHook) -> ClientBuilder:
        """Run ``hook(request)`` before every send. Sync or async."""
        self._request_hooks.append(hook)
        return self

    def on_response(self, hook: ResponseHook) -> ClientBuilder:
        """Run ``hook(response)`` after every response. Sync or async."""
        self._response_hooks.append(hook)
        return self

    # --- terminal -------------------------------------------------------- #

    def build(self) -> Client:
        """Construct the configured :class:`Client`."""
        return Client(
            token=self._token,
            base_url=self._base_url,
            timeout=self._timeout,
            headers=self._headers or None,
            http_client=self._http_client,
            user_agent=self._user_agent,
            retries=self._retries,
            retry_backoff=self._retry_backoff,
            request_hooks=tuple(self._request_hooks) or None,
            response_hooks=tuple(self._response_hooks) or None,
        )

    # --- introspection (handy in tests / logging) ------------------------ #

    def as_dict(self) -> dict[str, Any]:
        """Snapshot of the current configuration. Mainly useful for tests."""
        return {
            "token": self._token,
            "base_url": self._base_url,
            "timeout": self._timeout,
            "headers": dict(self._headers),
            "user_agent": self._user_agent,
            "http_client": self._http_client,
            "retries": self._retries,
            "retry_backoff": self._retry_backoff,
            "request_hook_count": len(self._request_hooks),
            "response_hook_count": len(self._response_hooks),
        }
