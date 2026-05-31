"""``app.rocksky.song.*`` — song views and creation."""

from __future__ import annotations

from typing import Any

from ..models import RecentListener, Song, SongBasic
from ._base import Resource, parse_list, parse_model


class SongResource(Resource):
    async def get(
        self,
        *,
        uri: str | None = None,
        mbid: str | None = None,
        isrc: str | None = None,
        spotify_id: str | None = None,
    ) -> Song:
        """Look up a song. Pass exactly one of ``uri``, ``mbid``, ``isrc``, or
        ``spotify_id``."""
        data = await self._transport.query(
            "app.rocksky.song.getSong",
            params={
                "uri": uri,
                "mbid": mbid,
                "isrc": isrc,
                "spotifyId": spotify_id,
            },
        )
        return parse_model(Song, data)

    async def list(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        genre: str | None = None,
        mbid: str | None = None,
        isrc: str | None = None,
        spotify_id: str | None = None,
    ) -> list[SongBasic]:
        data = await self._transport.query(
            "app.rocksky.song.getSongs",
            params={
                "limit": limit,
                "offset": offset,
                "genre": genre,
                "mbid": mbid,
                "isrc": isrc,
                "spotifyId": spotify_id,
            },
        )
        return parse_list(SongBasic, data, key="songs")

    async def get_recent_listeners(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[RecentListener]:
        data = await self._transport.query(
            "app.rocksky.song.getSongRecentListeners",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(RecentListener, data, key="listeners")

    async def match(
        self,
        title: str,
        artist: str,
        *,
        mb_id: str | None = None,
        isrc: str | None = None,
    ) -> Song:
        """Resolve title/artist (+ optional identifiers) to a canonical song."""
        data = await self._transport.query(
            "app.rocksky.song.matchSong",
            params={"title": title, "artist": artist, "mbId": mb_id, "isrc": isrc},
        )
        return parse_model(Song, data)

    async def create(
        self,
        *,
        title: str,
        artist: str,
        album: str,
        album_artist: str,
        duration: int | None = None,
        mb_id: str | None = None,
        isrc: str | None = None,
        album_art: str | None = None,
        track_number: int | None = None,
        release_date: str | None = None,
        year: int | None = None,
        disc_number: int | None = None,
        lyrics: str | None = None,
    ) -> dict[str, Any]:
        """Create a song record. Requires auth."""
        body = _drop_none(
            {
                "title": title,
                "artist": artist,
                "album": album,
                "albumArtist": album_artist,
                "duration": duration,
                "mbId": mb_id,
                "isrc": isrc,
                "albumArt": album_art,
                "trackNumber": track_number,
                "releaseDate": release_date,
                "year": year,
                "discNumber": disc_number,
                "lyrics": lyrics,
            }
        )
        return await self._transport.procedure(
            "app.rocksky.song.createSong", body=body, auth=True
        ) or {}


def _drop_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}
