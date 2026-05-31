"""``app.rocksky.playlist.*`` — playlist CRUD."""

from __future__ import annotations

from typing import Any

from ..models import Playlist, PlaylistBasic
from ._base import Resource, parse_list, parse_model


class PlaylistResource(Resource):
    async def get(self, uri: str) -> Playlist:
        data = await self._transport.query(
            "app.rocksky.playlist.getPlaylist", params={"uri": uri}
        )
        return parse_model(Playlist, data)

    async def list(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[PlaylistBasic]:
        data = await self._transport.query(
            "app.rocksky.playlist.getPlaylists",
            params={"limit": limit, "offset": offset},
        )
        return parse_list(PlaylistBasic, data, key="playlists")

    async def create(
        self,
        name: str,
        *,
        description: str | None = None,
    ) -> Playlist:
        params: dict[str, Any] = {"name": name}
        if description is not None:
            params["description"] = description
        data = await self._transport.procedure(
            "app.rocksky.playlist.createPlaylist", params=params, auth=True
        )
        return parse_model(Playlist, data)

    async def remove(self, uri: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.playlist.removePlaylist",
            params={"uri": uri},
            auth=True,
        ) or {}

    async def start(
        self,
        uri: str,
        *,
        shuffle: bool | None = None,
        position: int | None = None,
    ) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.playlist.startPlaylist",
            params={"uri": uri, "shuffle": shuffle, "position": position},
            auth=True,
        ) or {}

    async def insert_files(
        self,
        uri: str,
        files: list[str],
        *,
        position: int | None = None,
    ) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.playlist.insertFiles",
            params={"uri": uri, "files": files, "position": position},
            auth=True,
        ) or {}

    async def insert_directory(
        self,
        uri: str,
        directory: str,
        *,
        position: int | None = None,
    ) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.playlist.insertDirectory",
            params={"uri": uri, "directory": directory, "position": position},
            auth=True,
        ) or {}
