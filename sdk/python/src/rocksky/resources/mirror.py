"""``app.rocksky.mirror.*`` — external mirroring (Last.fm, ListenBrainz, …)."""

from __future__ import annotations

from typing import Any

from ..models import MirrorSource
from ._base import Resource, parse_list


class MirrorResource(Resource):
    async def list_sources(self) -> list[MirrorSource]:
        data = await self._transport.query(
            "app.rocksky.mirror.getMirrorSources", auth=True
        )
        if isinstance(data, list):
            return [MirrorSource.model_validate(item) for item in data]
        return parse_list(MirrorSource, data, key="sources") or parse_list(
            MirrorSource, data, key="mirrorSources"
        )

    async def put_source(
        self,
        provider: str,
        *,
        enabled: bool | None = None,
        external_username: str | None = None,
        api_key: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"provider": provider}
        if enabled is not None:
            body["enabled"] = enabled
        if external_username is not None:
            body["externalUsername"] = external_username
        if api_key is not None:
            body["apiKey"] = api_key
        return await self._transport.procedure(
            "app.rocksky.mirror.putMirrorSource", body=body, auth=True
        ) or {}
