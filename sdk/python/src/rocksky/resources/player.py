"""``app.rocksky.player.*`` — remote playback control (Rockbox/RockboxJS)."""

from __future__ import annotations

from typing import Any

from ._base import Resource


class PlayerResource(Resource):
    async def currently_playing(
        self,
        *,
        player_id: str | None = None,
        actor: str | None = None,
    ) -> Any:
        return await self._transport.query(
            "app.rocksky.player.getCurrentlyPlaying",
            params={"playerId": player_id, "actor": actor},
        )

    async def queue(self, *, player_id: str | None = None) -> Any:
        return await self._transport.query(
            "app.rocksky.player.getPlaybackQueue",
            params={"playerId": player_id},
        )

    async def play(self, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.play", params={"playerId": player_id}, auth=True
        )

    async def pause(self, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.pause", params={"playerId": player_id}, auth=True
        )

    async def next(self, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.next", params={"playerId": player_id}, auth=True
        )

    async def previous(self, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.previous", params={"playerId": player_id}, auth=True
        )

    async def seek(self, position: int, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.seek",
            params={"playerId": player_id, "position": position},
            auth=True,
        )

    async def play_file(self, file_id: str, *, player_id: str | None = None) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.playFile",
            params={"playerId": player_id, "fileId": file_id},
            auth=True,
        )

    async def play_directory(
        self,
        directory_id: str,
        *,
        player_id: str | None = None,
        shuffle: bool | None = None,
        recurse: bool | None = None,
        position: int | None = None,
    ) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.playDirectory",
            params={
                "playerId": player_id,
                "directoryId": directory_id,
                "shuffle": shuffle,
                "recurse": recurse,
                "position": position,
            },
            auth=True,
        )

    async def add_items_to_queue(
        self,
        items: list[str],
        *,
        player_id: str | None = None,
        position: int | None = None,
        shuffle: bool | None = None,
    ) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.addItemsToQueue",
            params={
                "playerId": player_id,
                "items": items,
                "position": position,
                "shuffle": shuffle,
            },
            auth=True,
        )

    async def add_directory_to_queue(
        self,
        directory: str,
        *,
        player_id: str | None = None,
        position: int | None = None,
        shuffle: bool | None = None,
    ) -> Any:
        return await self._transport.procedure(
            "app.rocksky.player.addDirectoryToQueue",
            params={
                "playerId": player_id,
                "directory": directory,
                "position": position,
                "shuffle": shuffle,
            },
            auth=True,
        )
