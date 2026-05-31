"""Actor (profile / per-actor library) endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..models import (
    AlbumBasic,
    ArtistBasic,
    Compatibility,
    Neighbour,
    PlaylistBasic,
    Profile,
    Scrobble,
    SongBasic,
)
from ._base import Resource, parse_list, parse_model


def _iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value


class ActorResource(Resource):
    """``app.rocksky.actor.*`` — profiles and per-actor library views."""

    async def get_profile(self, did: str | None = None) -> Profile:
        """Get a profile by handle or DID. With no argument, returns the
        authenticated user's profile (requires a token)."""
        data = await self._transport.query(
            "app.rocksky.actor.getProfile",
            params={"did": did},
            auth=did is None,
        )
        return parse_model(Profile, data)

    async def get_albums(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
        start_date: datetime | str | None = None,
        end_date: datetime | str | None = None,
    ) -> list[AlbumBasic]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorAlbums",
            params={
                "did": did,
                "limit": limit,
                "offset": offset,
                "startDate": _iso(start_date),
                "endDate": _iso(end_date),
            },
        )
        return parse_list(AlbumBasic, data, key="albums")

    async def get_artists(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
        start_date: datetime | str | None = None,
        end_date: datetime | str | None = None,
    ) -> list[ArtistBasic]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorArtists",
            params={
                "did": did,
                "limit": limit,
                "offset": offset,
                "startDate": _iso(start_date),
                "endDate": _iso(end_date),
            },
        )
        return parse_list(ArtistBasic, data, key="artists")

    async def get_songs(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
        start_date: datetime | str | None = None,
        end_date: datetime | str | None = None,
    ) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorSongs",
            params={
                "did": did,
                "limit": limit,
                "offset": offset,
                "startDate": _iso(start_date),
                "endDate": _iso(end_date),
            },
        )
        return parse_list(SongBasic, data, key="songs")

    async def get_scrobbles(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Scrobble]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorScrobbles",
            params={"did": did, "limit": limit, "offset": offset},
        )
        return parse_list(Scrobble, data, key="scrobbles")

    async def get_loved_songs(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorLovedSongs",
            params={"did": did, "limit": limit, "offset": offset},
        )
        return parse_list(SongBasic, data, key="lovedSongs") or parse_list(
            SongBasic, data, key="songs"
        )

    async def get_playlists(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[PlaylistBasic]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorPlaylists",
            params={"did": did, "limit": limit, "offset": offset},
        )
        return parse_list(PlaylistBasic, data, key="playlists")

    async def get_neighbours(self, did: str) -> list[Neighbour]:
        data = await self._transport.query(
            "app.rocksky.actor.getActorNeighbours",
            params={"did": did},
        )
        return parse_list(Neighbour, data, key="neighbours")

    async def get_compatibility(self, did: str) -> Compatibility:
        data = await self._transport.query(
            "app.rocksky.actor.getActorCompatibility",
            params={"did": did},
            auth=True,
        )
        return parse_model(Compatibility, data)

    async def get_status(self, did: str | None = None) -> dict[str, Any]:
        """Raw access — server hasn't published a typed schema for status yet."""
        data = await self._transport.query(
            "app.rocksky.actor.getProfile",
            params={"did": did},
        )
        return data or {}
