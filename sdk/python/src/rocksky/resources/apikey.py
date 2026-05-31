"""``app.rocksky.apikey.*`` — API key management for the authenticated user."""

from __future__ import annotations

from ..models import ApiKey
from ._base import Resource, parse_list, parse_model


class ApikeyResource(Resource):
    async def list(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[ApiKey]:
        data = await self._transport.query(
            "app.rocksky.apikey.getApikeys",
            params={"limit": limit, "offset": offset},
            auth=True,
        )
        if isinstance(data, list):
            return [ApiKey.model_validate(item) for item in data]
        return parse_list(ApiKey, data, key="apiKeys") or parse_list(
            ApiKey, data, key="keys"
        )

    async def create(self, name: str, *, description: str | None = None) -> ApiKey:
        data = await self._transport.procedure(
            "app.rocksky.apikey.createApikey",
            body={"name": name, **({"description": description} if description else {})},
            auth=True,
        )
        return parse_model(ApiKey, data)

    async def update(
        self,
        api_key_id: str,
        *,
        name: str,
        description: str | None = None,
    ) -> ApiKey:
        body = {"id": api_key_id, "name": name}
        if description is not None:
            body["description"] = description
        data = await self._transport.procedure(
            "app.rocksky.apikey.updateApikey", body=body, auth=True
        )
        return parse_model(ApiKey, data)

    async def remove(self, api_key_id: str) -> ApiKey:
        data = await self._transport.procedure(
            "app.rocksky.apikey.removeApikey",
            params={"id": api_key_id},
            auth=True,
        )
        return parse_model(ApiKey, data)
