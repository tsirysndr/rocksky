"""``app.rocksky.like.*`` — like / dislike songs and shouts."""

from __future__ import annotations

from typing import Any

from ._base import Resource


class LikeResource(Resource):
    async def like_song(self, uri: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.like.likeSong", body={"uri": uri}, auth=True
        ) or {}

    async def dislike_song(self, uri: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.like.dislikeSong", body={"uri": uri}, auth=True
        ) or {}

    async def like_shout(self, uri: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.like.likeShout", body={"uri": uri}, auth=True
        ) or {}

    async def dislike_shout(self, uri: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.like.dislikeShout", body={"uri": uri}, auth=True
        ) or {}
