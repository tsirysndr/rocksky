"""``app.rocksky.spotify.*`` — Spotify playback control proxy."""

from __future__ import annotations

from typing import Any

from ._base import Resource


class SpotifyResource(Resource):
    async def currently_playing(self, *, actor: str | None = None) -> Any:
        return await self._transport.query(
            "app.rocksky.spotify.getCurrentlyPlaying",
            params={"actor": actor},
        )

    async def play(self) -> Any:
        return await self._transport.procedure("app.rocksky.spotify.play", auth=True)

    async def pause(self) -> Any:
        return await self._transport.procedure("app.rocksky.spotify.pause", auth=True)

    async def next(self) -> Any:
        return await self._transport.procedure("app.rocksky.spotify.next", auth=True)

    async def previous(self) -> Any:
        return await self._transport.procedure("app.rocksky.spotify.previous", auth=True)

    async def seek(self, position: int) -> Any:
        return await self._transport.procedure(
            "app.rocksky.spotify.seek", params={"position": position}, auth=True
        )
