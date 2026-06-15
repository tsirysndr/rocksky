"""``app.rocksky.rockbox.*`` — Rockbox audio settings."""

from __future__ import annotations

from typing import Any

from ._base import Resource


class RockboxResource(Resource):
    async def get_audio_settings(self, did: str | None = None) -> dict[str, Any]:
        """Return Rockbox audio settings.

        If *did* is provided the request is public (no auth needed).
        If omitted the authenticated caller's own settings are returned (auth required).
        """
        params = {"did": did} if did else None
        return (
            await self._transport.query(
                "app.rocksky.rockbox.getAudioSettings",
                params=params,
                auth=did is None,
            )
        ) or {}

    async def put_audio_settings(
        self,
        *,
        crossfade: dict[str, Any] | None = None,
        equalizer: dict[str, Any] | None = None,
        replay_gain: dict[str, Any] | None = None,
        tone: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Upsert Rockbox audio settings. Only provided sections are merged."""
        body: dict[str, Any] = {}
        if crossfade is not None:
            body["crossfade"] = crossfade
        if equalizer is not None:
            body["equalizer"] = equalizer
        if replay_gain is not None:
            body["replayGain"] = replay_gain
        if tone is not None:
            body["tone"] = tone
        return await self._transport.procedure(
            "app.rocksky.rockbox.putAudioSettings", body=body, auth=True
        ) or {}
