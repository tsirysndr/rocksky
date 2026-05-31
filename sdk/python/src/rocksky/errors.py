"""Exceptions raised by the Rocksky SDK."""

from __future__ import annotations

from typing import Any


class RockskyError(Exception):
    """Base class for all Rocksky SDK errors."""


class APIError(RockskyError):
    """Raised when the API returns a non-2xx response.

    Attributes:
        status_code: HTTP status code.
        method: XRPC method id (e.g. ``app.rocksky.song.getSong``).
        error: Short error code returned by the server (when present).
        message: Human-readable error message returned by the server.
        body: Raw response body (parsed JSON or text).
    """

    def __init__(
        self,
        status_code: int,
        method: str,
        *,
        error: str | None = None,
        message: str | None = None,
        body: Any = None,
    ) -> None:
        self.status_code = status_code
        self.method = method
        self.error = error
        self.message = message
        self.body = body
        summary = message or error or "no message"
        super().__init__(f"[{status_code}] {method}: {summary}")


class AuthenticationError(APIError):
    """Raised for 401 responses."""


class PermissionError(APIError):
    """Raised for 403 responses."""


class NotFoundError(APIError):
    """Raised for 404 responses."""


class RateLimitError(APIError):
    """Raised for 429 responses."""


class ServerError(APIError):
    """Raised for 5xx responses."""


class TransportError(RockskyError):
    """Raised when the request fails before getting a response (network, timeout, etc.)."""


def from_response(
    status_code: int,
    method: str,
    *,
    error: str | None = None,
    message: str | None = None,
    body: Any = None,
) -> APIError:
    """Build the most specific APIError subclass for the given status code."""
    kwargs = {"error": error, "message": message, "body": body}
    if status_code == 401:
        return AuthenticationError(status_code, method, **kwargs)
    if status_code == 403:
        return PermissionError(status_code, method, **kwargs)
    if status_code == 404:
        return NotFoundError(status_code, method, **kwargs)
    if status_code == 429:
        return RateLimitError(status_code, method, **kwargs)
    if status_code >= 500:
        return ServerError(status_code, method, **kwargs)
    return APIError(status_code, method, **kwargs)
