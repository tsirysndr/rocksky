"""``app.rocksky.scrobble.*`` — scrobble feed and creation."""

from __future__ import annotations

from typing import Any

from ..models import Scrobble
from ._base import Resource, parse_list, parse_model


class ScrobbleResource(Resource):
    async def get(self, uri: str) -> Scrobble:
        """Get a single scrobble by AT-URI."""
        data = await self._transport.query(
            "app.rocksky.scrobble.getScrobble", params={"uri": uri}
        )
        return parse_model(Scrobble, data)

    async def list(
        self,
        *,
        did: str | None = None,
        following: bool | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Scrobble]:
        """List scrobbles, optionally filtered by actor or restricted to the
        authenticated user's follow graph."""
        data = await self._transport.query(
            "app.rocksky.scrobble.getScrobbles",
            params={
                "did": did,
                "following": following,
                "limit": limit,
                "offset": offset,
            },
            auth=following is not None,
        )
        return parse_list(Scrobble, data, key="scrobbles")

    async def create(
        self,
        *,
        title: str,
        artist: str,
        album: str | None = None,
        duration: int | None = None,
        mb_id: str | None = None,
        isrc: str | None = None,
        album_art: str | None = None,
        track_number: int | None = None,
        release_date: str | None = None,
        year: int | None = None,
        disc_number: int | None = None,
        lyrics: str | None = None,
        composer: str | None = None,
        copyright_message: str | None = None,
        label: str | None = None,
        artist_picture: str | None = None,
        spotify_link: str | None = None,
        lastfm_link: str | None = None,
        tidal_link: str | None = None,
        apple_music_link: str | None = None,
        youtube_link: str | None = None,
        deezer_link: str | None = None,
        timestamp: int | None = None,
    ) -> dict[str, Any]:
        """Create a new scrobble. Requires auth.

        ``timestamp`` is Unix seconds; if omitted the server stamps it.
        """
        body = _drop_none(
            {
                "title": title,
                "artist": artist,
                "album": album,
                "duration": duration,
                "mbId": mb_id,
                "isrc": isrc,
                "albumArt": album_art,
                "trackNumber": track_number,
                "releaseDate": release_date,
                "year": year,
                "discNumber": disc_number,
                "lyrics": lyrics,
                "composer": composer,
                "copyrightMessage": copyright_message,
                "label": label,
                "artistPicture": artist_picture,
                "spotifyLink": spotify_link,
                "lastfmLink": lastfm_link,
                "tidalLink": tidal_link,
                "appleMusicLink": apple_music_link,
                "youtubeLink": youtube_link,
                "deezerLink": deezer_link,
                "timestamp": timestamp,
            }
        )
        result = await self._transport.procedure(
            "app.rocksky.scrobble.createScrobble", body=body, auth=True
        )
        return result or {}


def _drop_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}
