"""``app.rocksky.artist.*`` — artist views and per-artist data."""

from __future__ import annotations

from ..models import (
    AlbumBasic,
    Artist,
    ArtistBasic,
    ArtistListener,
    RecentListener,
    SongBasic,
)
from ._base import Resource, parse_list, parse_model


class ArtistResource(Resource):
    async def get(self, uri: str) -> Artist:
        data = await self._transport.query(
            "app.rocksky.artist.getArtist", params={"uri": uri}
        )
        return parse_model(Artist, data)

    async def list(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        names: list[str] | str | None = None,
        genre: str | None = None,
    ) -> list[ArtistBasic]:
        data = await self._transport.query(
            "app.rocksky.artist.getArtists",
            params={
                "limit": limit,
                "offset": offset,
                "names": names,
                "genre": genre,
            },
        )
        return parse_list(ArtistBasic, data, key="artists")

    async def get_albums(self, uri: str) -> list[AlbumBasic]:
        data = await self._transport.query(
            "app.rocksky.artist.getArtistAlbums", params={"uri": uri}
        )
        return parse_list(AlbumBasic, data, key="albums")

    async def get_tracks(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.artist.getArtistTracks",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(SongBasic, data, key="tracks")

    async def get_listeners(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ArtistListener]:
        data = await self._transport.query(
            "app.rocksky.artist.getArtistListeners",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(ArtistListener, data, key="listeners")

    async def get_recent_listeners(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[RecentListener]:
        data = await self._transport.query(
            "app.rocksky.artist.getArtistRecentListeners",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(RecentListener, data, key="listeners")
