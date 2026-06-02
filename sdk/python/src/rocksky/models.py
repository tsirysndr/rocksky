"""Backward-compatible model surface for Rocksky SDK consumers.

Lexicon-derived types are auto-generated in ``rocksky.gen.models``. This module
re-exports them under the historical SDK names and extends a few with fields
that the public API returns but the lexicon does not yet declare.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from .gen.models import (
    ActorCompatibilityViewBasic as Compatibility,
    ActorNeighbourViewBasic as Neighbour,
    ActorProfileViewBasic as ProfileBasic,
    AlbumViewBasic as AlbumBasic,
    ApiKeyView as ApiKeyBase,
    ArtistListenerViewBasic as ArtistListener,
    ArtistViewBasic as ArtistBasic,
    FeedGeneratorView as FeedGenerator,
    FeedItemView as FeedItem,
    FeedRecommendationsView as Recommendations,
    FeedRecommendationView as Recommendation,
    FeedRecommendedAlbumView as RecommendedAlbum,
    FeedRecommendedArtistView as RecommendedArtist,
    FeedSearchResultsView as SearchResults,
    FeedStoryView as Story,
    FeedView as Feed,
    MirrorSourceView as MirrorSource,
    PlaylistViewBasic as PlaylistBasic,
    RockskyModel,
    ScrobbleViewBasic as ScrobbleBase,
    ShoutAuthor,
    ShoutView as Shout,
    SongFirstScrobbleView as FirstScrobble,
    SongRecentListenerView as RecentListener,
    SongViewBasic as SongBasic,
)

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


class Profile(ProfileBasic):
    spotify_connected: bool | None = None
    spotify_user: dict[str, Any] | None = None
    spotify_token: dict[str, Any] | None = None
    googledrive: dict[str, Any] | None = None
    dropbox: dict[str, Any] | None = None


class Artist(ArtistBasic):
    """Detailed artist view (currently identical fields to basic on the server)."""


class Album(AlbumBasic):
    tags: list[str] | None = None
    tracks: list[SongBasic] | None = None


class Song(SongBasic):
    artists: list[ArtistBasic] | None = None
    first_scrobble: FirstScrobble | None = None


class Scrobble(ScrobbleBase):
    listeners: int | None = None
    scrobbles: int | None = None
    artists: list[ArtistBasic] | None = None
    first_scrobble: FirstScrobble | None = None


class Playlist(PlaylistBasic):
    tracks: list[SongBasic] | None = None


class ApiKey(ApiKeyBase):
    enabled: bool | None = None
    api_key: str | None = Field(default=None, alias="apiKey")
    shared_secret: str | None = Field(default=None, alias="sharedSecret")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")


Album.model_rebuild()
Playlist.model_rebuild()
Song.model_rebuild()
Scrobble.model_rebuild()
