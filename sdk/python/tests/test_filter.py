"""Tests for the RSQL filter builder.

Loads ``rocksky/filter.py`` directly (not through the ``rocksky`` package) so
the suite stays hermetic — importing the package would dlopen the native core.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

import pytest


def _load_filter_module() -> ModuleType:
    path = Path(__file__).resolve().parent.parent / "src" / "rocksky" / "filter.py"
    spec = importlib.util.spec_from_file_location("rocksky_filter_standalone", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_filter = _load_filter_module()
Filter = _filter.Filter


def test_eq_bare_value() -> None:
    assert Filter.eq("artist", "Radiohead").build() == "artist==Radiohead"


def test_eq_quotes_spaces() -> None:
    assert Filter.eq("artist", "Daft Punk").build() == 'artist=="Daft Punk"'


def test_eq_escapes_quotes_and_backslashes() -> None:
    assert Filter.eq("title", 'He said "hi"').build() == 'title=="He said \\"hi\\""'
    assert Filter.eq("title", "back\\slash").build() == 'title=="back\\\\slash"'


def test_wildcard_stays_unquoted() -> None:
    assert Filter.eq("artist", "Daft*").build() == "artist==Daft*"


def test_ne() -> None:
    assert Filter.ne("artist", "Eminem").build() == "artist!=Eminem"


def test_ordered_comparisons() -> None:
    assert Filter.gt("duration", 200_000).build() == "duration=gt=200000"
    assert Filter.ge("year", 2000).build() == "year=ge=2000"
    assert Filter.lt("trackNumber", 5).build() == "trackNumber=lt=5"
    assert Filter.le("year", 1999).build() == "year=le=1999"


def test_in_and_out_lists() -> None:
    assert Filter.is_in("genre", ["house", "electro"]).build() == "genre=in=(house,electro)"
    assert Filter.is_out("genre", ["hip hop"]).build() == 'genre=out=("hip hop")'


def test_empty_lists_raise() -> None:
    with pytest.raises(ValueError):
        Filter.is_in("genre", [])
    with pytest.raises(ValueError):
        Filter.is_out("genre", [])


def test_null_checks() -> None:
    assert Filter.is_null("uri").build() == "uri==null"
    assert Filter.is_not_null("uri").build() == "uri!=null"


def test_and_joins_with_semicolon() -> None:
    built = Filter.eq("artist", "Radiohead").and_(Filter.gt("duration", 200_000)).build()
    assert built == "artist==Radiohead;duration=gt=200000"


def test_or_joins_with_comma() -> None:
    built = Filter.eq("artist", "Radiohead").or_(Filter.eq("artist", "Muse")).build()
    assert built == "artist==Radiohead,artist==Muse"


def test_or_inside_and_is_parenthesized() -> None:
    left = Filter.eq("artist", "Radiohead").or_(Filter.eq("artist", "Muse"))
    assert (
        left.and_(Filter.gt("duration", 200_000)).build()
        == "(artist==Radiohead,artist==Muse);duration=gt=200000"
    )
    right = Filter.eq("genre", "house").or_(Filter.eq("genre", "electro"))
    assert (
        Filter.eq("artist", "Radiohead").and_(right).build()
        == "artist==Radiohead;(genre==house,genre==electro)"
    )


def test_and_inside_or_is_not_parenthesized() -> None:
    built = (
        Filter.eq("artist", "Radiohead")
        .and_(Filter.gt("duration", 200_000))
        .or_(Filter.eq("genre", "house"))
        .build()
    )
    assert built == "artist==Radiohead;duration=gt=200000,genre==house"


def test_dotted_fields_and_booleans() -> None:
    assert Filter.eq("track.artist", "Daft Punk").build() == 'track.artist=="Daft Punk"'
    assert Filter.eq("liked", True).build() == "liked==true"
    assert Filter.eq("liked", False).build() == "liked==false"


def test_str_and_repr() -> None:
    flt = Filter.eq("artist", "Radiohead")
    assert str(flt) == flt.build()
    assert "artist==Radiohead" in repr(flt)


def test_equality_and_hash() -> None:
    assert Filter.eq("artist", "Muse") == Filter.eq("artist", "Muse")
    assert hash(Filter.eq("artist", "Muse")) == hash(Filter.eq("artist", "Muse"))
    assert Filter.eq("artist", "Muse") != Filter.ne("artist", "Muse")
