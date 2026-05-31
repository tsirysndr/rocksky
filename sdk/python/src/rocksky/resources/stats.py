"""``app.rocksky.stats.*`` — stats and Wrapped."""

from __future__ import annotations

from typing import Any

from ._base import Resource


class StatsResource(Resource):
    async def get(self, did: str) -> dict[str, Any]:
        """Get aggregate listening stats for an actor."""
        data = await self._transport.query(
            "app.rocksky.stats.getStats", params={"did": did}
        )
        return data or {}

    async def wrapped(self, did: str, *, year: int | None = None) -> dict[str, Any]:
        """Get the Wrapped (year-in-review) payload for an actor.

        Defaults to the most recent completed year on the server side.
        """
        data = await self._transport.query(
            "app.rocksky.stats.getWrapped",
            params={"did": did, "year": year},
        )
        return data or {}
