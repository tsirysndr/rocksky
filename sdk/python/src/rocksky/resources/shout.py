"""``app.rocksky.shout.*`` — shoutbox."""

from __future__ import annotations

from typing import Any

from ..models import Shout
from ._base import Resource, parse_list, parse_model


class ShoutResource(Resource):
    async def create(self, message: str) -> Shout:
        """Create a shout on the authenticated user's profile."""
        data = await self._transport.procedure(
            "app.rocksky.shout.createShout",
            body={"message": message},
            auth=True,
        )
        return parse_model(Shout, data)

    async def reply(self, shout_id: str, message: str) -> Shout:
        data = await self._transport.procedure(
            "app.rocksky.shout.replyShout",
            body={"shoutId": shout_id, "message": message},
            auth=True,
        )
        return parse_model(Shout, data)

    async def remove(self, shout_id: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.shout.removeShout",
            params={"id": shout_id},
            auth=True,
        ) or {}

    async def report(self, shout_id: str, *, reason: str | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {"shoutId": shout_id}
        if reason is not None:
            body["reason"] = reason
        return await self._transport.procedure(
            "app.rocksky.shout.reportShout", body=body, auth=True
        ) or {}

    async def for_profile(
        self,
        did: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Shout]:
        data = await self._transport.query(
            "app.rocksky.shout.getProfileShouts",
            params={"did": did, "limit": limit, "offset": offset},
        )
        return parse_list(Shout, data, key="shouts")

    async def for_album(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Shout]:
        data = await self._transport.query(
            "app.rocksky.shout.getAlbumShouts",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(Shout, data, key="shouts")

    async def for_artist(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Shout]:
        data = await self._transport.query(
            "app.rocksky.shout.getArtistShouts",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(Shout, data, key="shouts")

    async def for_track(self, uri: str) -> list[Shout]:
        data = await self._transport.query(
            "app.rocksky.shout.getTrackShouts", params={"uri": uri}
        )
        return parse_list(Shout, data, key="shouts")

    async def replies(
        self,
        uri: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[Shout]:
        data = await self._transport.query(
            "app.rocksky.shout.getShoutReplies",
            params={"uri": uri, "limit": limit, "offset": offset},
        )
        return parse_list(Shout, data, key="replies") or parse_list(
            Shout, data, key="shouts"
        )
