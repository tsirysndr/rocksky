"""``app.rocksky.charts.*`` — chart queries."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..models import ArtistBasic, SongBasic
from ._base import Resource, parse_list


def _iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value


class ChartsResource(Resource):
    async def top_tracks(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        start_date: datetime | str | None = None,
        end_date: datetime | str | None = None,
    ) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.charts.getTopTracks",
            params={
                "limit": limit,
                "offset": offset,
                "startDate": _iso(start_date),
                "endDate": _iso(end_date),
            },
        )
        return parse_list(SongBasic, data, key="tracks")

    async def top_artists(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        start_date: datetime | str | None = None,
        end_date: datetime | str | None = None,
    ) -> list[ArtistBasic]:
        data = await self._transport.query(
            "app.rocksky.charts.getTopArtists",
            params={
                "limit": limit,
                "offset": offset,
                "startDate": _iso(start_date),
                "endDate": _iso(end_date),
            },
        )
        return parse_list(ArtistBasic, data, key="artists")

    async def scrobbles_chart(
        self,
        *,
        did: str | None = None,
        artist_uri: str | None = None,
        album_uri: str | None = None,
        song_uri: str | None = None,
        genre: str | None = None,
        from_: datetime | str | None = None,
        to: datetime | str | None = None,
    ) -> Any:
        """Scrobble counts over time. Server returns a time-series shaped dict."""
        return await self._transport.query(
            "app.rocksky.charts.getScrobblesChart",
            params={
                "did": did,
                "artisturi": artist_uri,
                "albumuri": album_uri,
                "songuri": song_uri,
                "genre": genre,
                "from": _iso(from_),
                "to": _iso(to),
            },
        )
