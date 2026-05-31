"""Model parsing tests — alias handling, extra fields, and snake_case access."""

from __future__ import annotations

from datetime import datetime

from rocksky import Album, ApiKey, Profile, Scrobble, Song


def test_profile_accepts_camel_case_input() -> None:
    p = Profile.model_validate(
        {
            "did": "did:plc:abc",
            "handle": "alice.bsky.social",
            "displayName": "Alice",
            "createdAt": "2024-01-01T00:00:00Z",
            "spotifyConnected": True,
        }
    )
    assert p.display_name == "Alice"
    assert isinstance(p.created_at, datetime)
    assert p.spotify_connected is True


def test_model_accepts_snake_case_input_too() -> None:
    p = Profile.model_validate(
        {
            "did": "did:plc:abc",
            "display_name": "Bob",
        }
    )
    assert p.display_name == "Bob"


def test_extra_fields_preserved() -> None:
    """Unknown fields shouldn't break parsing; the API may add new ones."""
    p = Profile.model_validate({"did": "did:plc:x", "futureField": 123})
    assert p.did == "did:plc:x"
    # extra="allow" surfaces additions on the instance
    assert p.model_extra is not None
    assert p.model_extra.get("futureField") == 123


def test_apikey_camel_aliases() -> None:
    k = ApiKey.model_validate({"id": "k", "apiKey": "abc", "sharedSecret": "xyz"})
    assert k.api_key == "abc"
    assert k.shared_secret == "xyz"


def test_scrobble_nested_artists() -> None:
    s = Scrobble.model_validate(
        {
            "id": "s1",
            "artists": [{"id": "a1", "name": "Kate Bush", "uri": "at://k"}],
        }
    )
    assert s.artists is not None
    assert s.artists[0].name == "Kate Bush"


def test_album_with_nested_tracks() -> None:
    album = Album.model_validate(
        {
            "id": "al1",
            "title": "Hounds of Love",
            "tracks": [{"id": "t1", "title": "Running Up That Hill"}],
        }
    )
    assert album.tracks is not None
    assert album.tracks[0].title == "Running Up That Hill"


def test_song_serializes_back_to_camel_case() -> None:
    song = Song(title="x", album_art="https://example.test/a.jpg")
    dumped = song.model_dump(by_alias=True, exclude_none=True)
    assert dumped == {"title": "x", "albumArt": "https://example.test/a.jpg"}
