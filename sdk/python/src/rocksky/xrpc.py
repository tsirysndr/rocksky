"""Raw XRPC transport shared by the generated typed client."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from email.message import Message
from typing import IO, Literal
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from pydantic import JsonValue


class XrpcError(Exception):
    def __init__(self, status: int, body: bytes):
        self.status, self.body = status, body
        super().__init__(f"XRPC HTTP {status}: {body.decode('utf-8', errors='replace')}")


@dataclass(frozen=True)
class RawResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes

    def raise_for_status(self) -> None:
        if not 200 <= self.status < 300:
            raise XrpcError(self.status, self.body)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(
        self, req: Request, fp: IO[bytes], code: int, msg: str, headers: Message, newurl: str
    ) -> None:
        return None


class XrpcTransport:
    def __init__(
        self,
        endpoint: str = "https://api.rocksky.app",
        token: str | None = None,
        timeout: float = 30,
    ):
        self.endpoint, self.token, self.timeout = endpoint.rstrip("/"), token, timeout
        self._opener = build_opener(_NoRedirect)

    def raw(
        self,
        method: Literal["GET", "POST"],
        nsid: str,
        *,
        params: Mapping[str, JsonValue] | None = None,
        body: JsonValue = None,
    ) -> RawResponse:
        """Call any XRPC method. Arrays repeat query keys; body and params are independent.

        HTTP errors are returned unchanged; network errors raise urllib.error.URLError.
        Redirects are not followed, keeping bearer tokens on the requested host.
        """
        if method not in ("GET", "POST") or not re.fullmatch(
            r"[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+", nsid
        ):
            raise ValueError("Invalid XRPC method or NSID")
        pairs: list[tuple[str, str]] = []
        for key, value in (params or {}).items():
            for item in value if isinstance(value, list) else [value]:
                if item is None:
                    continue
                if not isinstance(item, (str, int, float, bool)):
                    raise ValueError(f"Invalid query parameter: {key}")
                pairs.append((key, str(item).lower() if isinstance(item, bool) else str(item)))
        query = urlencode(pairs)
        url = f"{self.endpoint}/xrpc/{nsid}" + (f"?{query}" if query else "")
        headers = {"Accept": "application/json", "User-Agent": "Rocksky-Python/typed-xrpc"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        data = json.dumps(body, allow_nan=False).encode() if body is not None else None
        if method == "POST":
            headers["Content-Type"] = "application/json"
            data = data if data is not None else b""
        request = Request(url, data=data, headers=headers, method=method)
        try:
            response = self._opener.open(request, timeout=self.timeout)
        except HTTPError as error:
            response = error
        with response:
            return RawResponse(response.status, dict(response.headers), response.read())
