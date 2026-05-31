"""Internal HTTP transport for the Rocksky XRPC API."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

import httpx

from ._version import __version__
from .errors import TransportError, from_response

DEFAULT_BASE_URL = "https://api.rocksky.app"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRY_BACKOFF = 0.5

RequestHook = Callable[[httpx.Request], None | Awaitable[None]]
ResponseHook = Callable[[httpx.Response], None | Awaitable[None]]


class HTTPTransport:
    """Thin wrapper around httpx.AsyncClient that speaks XRPC.

    Constructed once and shared by every resource on a Client. Owns the
    underlying httpx client and may be entered as a context manager.

    Optional cross-cutting features:
      * ``retries`` — retry transport errors and 5xx responses with
        exponential backoff.
      * ``request_hooks`` / ``response_hooks`` — observe (and possibly
        mutate) every request/response. Sync or async callables both work.
    """

    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE_URL,
        token: str | None = None,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        headers: Mapping[str, str] | None = None,
        http_client: httpx.AsyncClient | None = None,
        user_agent: str | None = None,
        retries: int = 0,
        retry_backoff: float = DEFAULT_RETRY_BACKOFF,
        request_hooks: Sequence[RequestHook] | None = None,
        response_hooks: Sequence[ResponseHook] | None = None,
    ) -> None:
        if retries < 0:
            raise ValueError("retries must be >= 0")
        self.base_url = base_url.rstrip("/")
        self._token = token
        self._owns_client = http_client is None
        self._retries = retries
        self._retry_backoff = retry_backoff
        self._request_hooks: list[RequestHook] = list(request_hooks or [])
        self._response_hooks: list[ResponseHook] = list(response_hooks or [])
        default_headers: dict[str, str] = {
            "user-agent": user_agent or f"rocksky-python/{__version__}",
            "accept": "application/json",
        }
        if headers:
            default_headers.update({k.lower(): v for k, v in headers.items()})
        self._http = http_client or httpx.AsyncClient(
            timeout=timeout,
            headers=default_headers,
        )

    @property
    def token(self) -> str | None:
        return self._token

    def set_token(self, token: str | None) -> None:
        """Update the bearer token used for subsequent requests."""
        self._token = token

    def add_request_hook(self, hook: RequestHook) -> None:
        self._request_hooks.append(hook)

    def add_response_hook(self, hook: ResponseHook) -> None:
        self._response_hooks.append(hook)

    async def aclose(self) -> None:
        """Close the underlying HTTP client if we own it."""
        if self._owns_client:
            await self._http.aclose()

    async def query(
        self,
        method: str,
        *,
        params: Mapping[str, Any] | None = None,
        auth: bool = False,
    ) -> Any:
        """Perform an XRPC ``query`` (HTTP GET)."""
        return await self._request("GET", method, params=params, auth=auth)

    async def procedure(
        self,
        method: str,
        *,
        params: Mapping[str, Any] | None = None,
        body: Any = None,
        auth: bool = True,
    ) -> Any:
        """Perform an XRPC ``procedure`` (HTTP POST).

        ``params`` are encoded as query string parameters when the lexicon
        declares them (some procedures, e.g. ``removeApikey``, use only params).
        """
        return await self._request(
            "POST", method, params=params, json=body, auth=auth
        )

    async def _request(
        self,
        verb: str,
        method: str,
        *,
        params: Mapping[str, Any] | None = None,
        json: Any = None,
        auth: bool = False,
    ) -> Any:
        url = f"{self.base_url}/xrpc/{method}"
        headers: dict[str, str] = {}
        if auth:
            if not self._token:
                raise from_response(
                    401,
                    method,
                    error="MissingToken",
                    message="this method requires authentication — pass `token=...` to Client",
                )
            headers["authorization"] = f"Bearer {self._token}"

        request = self._http.build_request(
            verb,
            url,
            params=_clean_params(params),
            json=json,
            headers=headers,
        )

        attempts = self._retries + 1
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                await _run_hooks(self._request_hooks, request)
                response = await self._http.send(request)
                await _run_hooks(self._response_hooks, response)
            except httpx.HTTPError as exc:
                last_exc = TransportError(f"request to {method} failed: {exc}")
                last_exc.__cause__ = exc
                if attempt < attempts - 1:
                    await asyncio.sleep(_backoff(self._retry_backoff, attempt))
                    continue
                raise last_exc from exc

            if response.status_code >= 500 and attempt < attempts - 1:
                await asyncio.sleep(_backoff(self._retry_backoff, attempt))
                continue

            return _parse_response(response, method)

        # The loop always either returns or raises; this is just a defensive guard.
        assert last_exc is not None
        raise last_exc


def _backoff(base: float, attempt: int) -> float:
    return base * (2**attempt)


async def _run_hooks(
    hooks: Sequence[Callable[[Any], None | Awaitable[None]]],
    payload: Any,
) -> None:
    for hook in hooks:
        result = hook(payload)
        if inspect.isawaitable(result):
            await result


def _clean_params(params: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """Drop None values and stringify booleans, leaving the rest to httpx."""
    if not params:
        return None
    cleaned: dict[str, Any] = {}
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, bool):
            cleaned[key] = "true" if value else "false"
        else:
            cleaned[key] = value
    return cleaned or None


def _parse_response(response: httpx.Response, method: str) -> Any:
    if response.status_code >= 400:
        body: Any
        try:
            body = response.json()
        except ValueError:
            body = response.text
        err_code = None
        message = None
        if isinstance(body, dict):
            err_code = body.get("error")
            message = body.get("message")
        raise from_response(
            response.status_code,
            method,
            error=err_code,
            message=message or (body if isinstance(body, str) and body else None),
            body=body,
        )
    if response.status_code == 204 or not response.content:
        return None
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return response.json()
    return response.text


__all__ = [
    "DEFAULT_BASE_URL",
    "DEFAULT_RETRY_BACKOFF",
    "DEFAULT_TIMEOUT",
    "HTTPTransport",
    "RequestHook",
    "ResponseHook",
]
