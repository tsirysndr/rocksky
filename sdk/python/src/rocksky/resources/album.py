"""``app.rocksky.album.*`` — album views."""

from __future__ import annotations

from ..models import Album, AlbumBasic, SongBasic
from ._base import Resource, parse_list, parse_model


class AlbumResource(Resource):
    async def get(self, uri: str) -> Album:
        """Get a detailed album view by AT-URI."""
        data = await self._transport.query(
            "app.rocksky.album.getAlbum",
            params={"uri": uri},
        )
        return parse_model(Album, data)

    async def list(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        genre: str | None = None,
    ) -> list[AlbumBasic]:
        data = await self._transport.query(
            "app.rocksky.album.getAlbums",
            params={"limit": limit, "offset": offset, "genre": genre},
        )
        return parse_list(AlbumBasic, data, key="albums")

    async def get_tracks(self, uri: str) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.album.getAlbumTracks",
            params={"uri": uri},
        )
        return parse_list(SongBasic, data, key="tracks")
