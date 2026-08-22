"""Fluent builder for RSQL filter expressions.

Accepted by the ``filter`` parameter of the catalog and scrobble-feed queries
(``app.rocksky.song.getSongs``, ``app.rocksky.artist.getArtists``,
``app.rocksky.album.getAlbums``, ``app.rocksky.scrobble.getScrobbles``)::

    from rocksky import AppView, Filter

    flt = (
        Filter.eq("artist", "Daft Punk")
        .and_(Filter.gt("duration", 200_000))
        .or_(Filter.is_in("genre", ["house", "electro"]))
    )
    songs = AppView().catalog_songs(50, 0, None, flt.build())
    # artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)

String values are quoted and escaped automatically when they contain characters
RSQL reserves; ``*`` wildcards pass through unquoted so
``Filter.eq("artist", "Daft*")`` performs a case-insensitive match.

Filterable fields per endpoint:

- songs: ``title, artist, album, albumArtist, genre, composer, label, duration,
  trackNumber, discNumber, mbId, isrc, sha256, uri, albumUri, artistUri, createdAt``
- albums: ``title, artist, year, releaseDate, sha256, uri, artistUri, createdAt``
- artists: ``name, genres, bornIn, born, died, sha256, uri, createdAt``
- scrobbles: ``uri, date, timestamp, title, artist, album, track.title,
  track.artist, track.album, track.albumArtist, track.genre, track.duration,
  track.isrc, track.mbId, user.did, user.handle, user.displayName, artist.name,
  artist.genres``
"""

from __future__ import annotations

import re
from collections.abc import Iterable

FilterValue = str | int | float | bool

_SAFE_VALUE = re.compile(r"^[A-Za-z0-9_.:@*+-]+$")

_COMPARISON = "comparison"
_AND = "and"
_OR = "or"


def _render(value: FilterValue) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if value and _SAFE_VALUE.match(value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


class Filter:
    """An immutable RSQL filter expression. See the module docs for the grammar."""

    __slots__ = ("_expr", "_kind")

    def __init__(self, expr: str, kind: str) -> None:
        self._expr = expr
        self._kind = kind

    # -- comparisons -------------------------------------------------------

    @staticmethod
    def eq(field: str, value: FilterValue) -> Filter:
        """``field==value`` — equals; ``*`` in string values is a wildcard."""
        return Filter(f"{field}=={_render(value)}", _COMPARISON)

    @staticmethod
    def ne(field: str, value: FilterValue) -> Filter:
        """``field!=value`` — not equals."""
        return Filter(f"{field}!={_render(value)}", _COMPARISON)

    @staticmethod
    def gt(field: str, value: FilterValue) -> Filter:
        """``field=gt=value`` — greater than."""
        return Filter(f"{field}=gt={_render(value)}", _COMPARISON)

    @staticmethod
    def ge(field: str, value: FilterValue) -> Filter:
        """``field=ge=value`` — greater than or equal."""
        return Filter(f"{field}=ge={_render(value)}", _COMPARISON)

    @staticmethod
    def lt(field: str, value: FilterValue) -> Filter:
        """``field=lt=value`` — less than."""
        return Filter(f"{field}=lt={_render(value)}", _COMPARISON)

    @staticmethod
    def le(field: str, value: FilterValue) -> Filter:
        """``field=le=value`` — less than or equal."""
        return Filter(f"{field}=le={_render(value)}", _COMPARISON)

    @staticmethod
    def _list(field: str, op: str, values: Iterable[FilterValue]) -> Filter:
        rendered = [_render(v) for v in values]
        if not rendered:
            raise ValueError(f"Filter {op} on {field!r} needs at least one value")
        return Filter(f"{field}{op}({','.join(rendered)})", _COMPARISON)

    @staticmethod
    def is_in(field: str, values: Iterable[FilterValue]) -> Filter:
        """``field=in=(a,b)`` — matches any of the values."""
        return Filter._list(field, "=in=", values)

    @staticmethod
    def is_out(field: str, values: Iterable[FilterValue]) -> Filter:
        """``field=out=(a,b)`` — matches none of the values."""
        return Filter._list(field, "=out=", values)

    @staticmethod
    def is_null(field: str) -> Filter:
        """``field==null`` — the field is NULL."""
        return Filter(f"{field}==null", _COMPARISON)

    @staticmethod
    def is_not_null(field: str) -> Filter:
        """``field!=null`` — the field is not NULL."""
        return Filter(f"{field}!=null", _COMPARISON)

    # -- combinators -------------------------------------------------------

    def _wrapped(self) -> str:
        return f"({self._expr})" if self._kind == _OR else self._expr

    def and_(self, other: Filter) -> Filter:
        """Both sides must match (``;``). An ``or`` operand is parenthesized."""
        return Filter(f"{self._wrapped()};{other._wrapped()}", _AND)

    def or_(self, other: Filter) -> Filter:
        """Either side may match (``,``)."""
        return Filter(f"{self._expr},{other._expr}", _OR)

    # -- output ------------------------------------------------------------

    def build(self) -> str:
        """The RSQL expression string to send as the ``filter`` query param."""
        return self._expr

    def __str__(self) -> str:
        return self._expr

    def __repr__(self) -> str:
        return f"Filter({self._expr!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Filter):
            return NotImplemented
        return self._expr == other._expr and self._kind == other._kind

    def __hash__(self) -> int:
        return hash((self._expr, self._kind))
