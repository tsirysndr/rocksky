"""Shared base for resource modules."""

from __future__ import annotations

from typing import Any, TypeVar

from pydantic import BaseModel

from .._http import HTTPTransport

T = TypeVar("T", bound=BaseModel)


class Resource:
    """Resources hold a reference to the shared transport.

    Subclasses expose XRPC endpoints as methods grouped by namespace
    (actor, song, scrobble, …).
    """

    def __init__(self, transport: HTTPTransport) -> None:
        self._transport = transport


def parse_model(model: type[T], data: Any) -> T:
    """Parse ``data`` into ``model``, tolerating missing input.

    The API occasionally returns ``{}`` (e.g. ``getProfile`` for an unknown
    handle); pydantic with all-optional fields handles that fine.
    """
    if data is None:
        data = {}
    return model.model_validate(data)


def parse_list(model: type[T], data: Any, key: str | None = None) -> list[T]:
    """Parse a list response into ``[model]``.

    Many endpoints wrap their payload in a single key (``scrobbles``,
    ``tracks``, ``feeds``, …); pass ``key`` to unwrap it. Returns an empty
    list when the key is missing or the body isn't an object.
    """
    if data is None:
        return []
    if key is not None:
        data = data.get(key, []) if isinstance(data, dict) else []
    if not isinstance(data, list):
        return []
    return [model.model_validate(item) for item in data]
