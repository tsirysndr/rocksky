"""Pydantic models for Rocksky API responses.

The API speaks camelCase JSON; models accept both camelCase (alias) and snake_case
(field name) so consumers may use whichever feels natural. Unknown fields are
preserved rather than rejected, so additions to the API surface won't break
existing SDK consumers.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "Album",
    "AlbumBasic",
    "ApiKey",
    "Artist",
    "ArtistBasic",
    "ArtistListener",
    "Compatibility",
    "Feed",
    "FeedGenerator",
    "FeedItem",
    "FirstScrobble",
    "MirrorSource",
    "Neighbour",
    "Playlist",
    "PlaylistBasic",
    "Profile",
    "ProfileBasic",
    "RecentListener",
    "Recommendation",
    "Recommendations",
    "RecommendedAlbum",
    "RecommendedArtist",
    "RockskyModel",
    "Scrobble",
    "SearchResults",
    "Shout",
    "ShoutAuthor",
    "Song",
    "SongBasic",
    "Story",
]


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.title() for part in tail)


class RockskyModel(BaseModel):
    """Base model used by every SDK response type."""

    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="allow",
        str_strip_whitespace=True,
    )


# --------------------------------------------------------------------------- #
# Actor
# --------------------------------------------------------------------------- #


class ProfileBasic(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = None
    avatar: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Profile(ProfileBasic):
    spotify_connected: bool | None = None
    spotify_user: dict[str, Any] | None = None
    spotify_token: dict[str, Any] | None = None
    googledrive: dict[str, Any] | None = None
    dropbox: dict[str, Any] | None = None


# --------------------------------------------------------------------------- #
# Artist
# --------------------------------------------------------------------------- #


class ArtistBasic(RockskyModel):
    id: str | None = None
    uri: str | None = None
    name: str | None = None
    picture: str | None = None
    sha256: str | None = None
    play_count: int | None = None
    unique_listeners: int | None = None
    tags: list[str] | None = None


class Artist(ArtistBasic):
    """Detailed artist view (currently identical fields to basic on the server)."""


# --------------------------------------------------------------------------- #
# Album
# --------------------------------------------------------------------------- #


class AlbumBasic(RockskyModel):
    id: str | None = None
    uri: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = None
    year: int | None = None
    album_art: str | None = None
    release_date: str | None = None
    sha256: str | None = None
    play_count: int | None = None
    unique_listeners: int | None = None


class Album(AlbumBasic):
    tags: list[str] | None = None
    tracks: list[SongBasic] | None = None


# --------------------------------------------------------------------------- #
# Song
# --------------------------------------------------------------------------- #


class FirstScrobble(RockskyModel):
    handle: str | None = None
    avatar: str | None = None
    timestamp: datetime | None = None


class SongBasic(RockskyModel):
    id: str | None = None
    title: str | None = None
    artist: str | None = None
    album_artist: str | None = None
    album_art: str | None = None
    uri: str | None = None
    album: str | None = None
    duration: int | None = None
    track_number: int | None = None
    disc_number: int | None = None
    play_count: int | None = None
    unique_listeners: int | None = None
    album_uri: str | None = None
    artist_uri: str | None = None
    sha256: str | None = None
    mbid: str | None = None
    isrc: str | None = None
    tags: list[str] | None = None
    created_at: datetime | None = None


class Song(SongBasic):
    artists: list[ArtistBasic] | None = None
    first_scrobble: FirstScrobble | None = None


class RecentListener(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = None
    avatar: str | None = None
    timestamp: datetime | None = None
    scrobble_uri: str | None = None


class ArtistListener(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = None
    avatar: str | None = None
    most_listened_song: dict[str, Any] | None = None
    total_plays: int | None = None
    rank: int | None = None


# --------------------------------------------------------------------------- #
# Scrobble
# --------------------------------------------------------------------------- #


class Scrobble(RockskyModel):
    id: str | None = None
    user: str | None = None
    user_display_name: str | None = None
    user_avatar: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = None
    album: str | None = None
    album_uri: str | None = None
    cover: str | None = None
    date: datetime | None = None
    uri: str | None = None
    sha256: str | None = None
    liked: bool | None = None
    likes_count: int | None = None
    listeners: int | None = None
    scrobbles: int | None = None
    artists: list[ArtistBasic] | None = None
    first_scrobble: FirstScrobble | None = None


# --------------------------------------------------------------------------- #
# Shouts
# --------------------------------------------------------------------------- #


class ShoutAuthor(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = None
    avatar: str | None = None


class Shout(RockskyModel):
    id: str | None = None
    message: str | None = None
    parent: str | None = None
    created_at: datetime | None = None
    author: ShoutAuthor | None = None


# --------------------------------------------------------------------------- #
# API Keys
# --------------------------------------------------------------------------- #


class ApiKey(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    api_key: str | None = Field(default=None, alias="apiKey")
    shared_secret: str | None = Field(default=None, alias="sharedSecret")
    created_at: datetime | None = None
    updated_at: datetime | None = None


# --------------------------------------------------------------------------- #
# Playlist
# --------------------------------------------------------------------------- #


class PlaylistBasic(RockskyModel):
    id: str | None = None
    title: str | None = None
    uri: str | None = None
    curator_did: str | None = None
    curator_handle: str | None = None
    curator_name: str | None = None
    curator_avatar_url: str | None = None
    description: str | None = None
    cover_image_url: str | None = None
    created_at: datetime | None = None
    track_count: int | None = None


class Playlist(PlaylistBasic):
    tracks: list[SongBasic] | None = None


# --------------------------------------------------------------------------- #
# Feed
# --------------------------------------------------------------------------- #


class FeedGenerator(RockskyModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    uri: str | None = None
    avatar: str | None = None
    creator: ProfileBasic | None = None


class FeedItem(RockskyModel):
    scrobble: Scrobble | None = None


class Feed(RockskyModel):
    feed: list[FeedItem] = Field(default_factory=list)
    cursor: str | None = None


class Story(RockskyModel):
    id: str | None = None
    did: str | None = None
    handle: str | None = None
    avatar: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = None
    album: str | None = None
    album_uri: str | None = None
    album_artist: str | None = None
    album_art: str | None = None
    created_at: str | None = None
    track_id: str | None = None
    track_uri: str | None = None
    uri: str | None = None


class Recommendation(RockskyModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    album_art: str | None = None
    track_uri: str | None = None
    artist_uri: str | None = None
    album_uri: str | None = None
    genres: list[str] | None = None
    recommendation_score: int | None = None
    source: str | None = None
    likes_count: int | None = None


class Recommendations(RockskyModel):
    recommendations: list[Recommendation] = Field(default_factory=list)
    cursor: str | None = None


class RecommendedArtist(RockskyModel):
    id: str | None = None
    uri: str | None = None
    name: str | None = None
    picture: str | None = None
    genres: list[str] | None = None
    recommendation_score: int | None = None
    source: str | None = None


class RecommendedAlbum(RockskyModel):
    id: str | None = None
    uri: str | None = None
    title: str | None = None
    artist: str | None = None
    artist_uri: str | None = None
    year: int | None = None
    album_art: str | None = None
    recommendation_score: int | None = None
    source: str | None = None


class SearchResults(RockskyModel):
    """Heterogeneous search hits — items may be songs, albums, artists, playlists, or profiles."""

    hits: list[dict[str, Any]] = Field(default_factory=list)
    processing_time_ms: int | None = None
    limit: int | None = None
    offset: int | None = None
    estimated_total_hits: int | None = None


# --------------------------------------------------------------------------- #
# Actor compatibility / neighbours
# --------------------------------------------------------------------------- #


class Compatibility(RockskyModel):
    compatibility_level: int | None = None
    compatibility_percentage: int | None = None
    shared_artists: int | None = None
    top_shared_artist_names: list[str] | None = None
    top_shared_detailed_artists: list[ArtistBasic] | None = None
    user1_artist_count: int | None = None
    user2_artist_count: int | None = None


class Neighbour(RockskyModel):
    user_id: str | None = None
    did: str | None = None
    handle: str | None = None
    display_name: str | None = None
    avatar: str | None = None
    shared_artists_count: int | None = None
    similarity_score: int | None = None
    top_shared_artist_names: list[str] | None = None
    top_shared_artists_details: list[ArtistBasic] | None = None


# --------------------------------------------------------------------------- #
# Mirror
# --------------------------------------------------------------------------- #


class MirrorSource(RockskyModel):
    id: str | None = None
    kind: str | None = None
    enabled: bool | None = None
    config: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


Album.model_rebuild()
