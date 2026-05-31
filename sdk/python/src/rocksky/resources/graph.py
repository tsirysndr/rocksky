"""``app.rocksky.graph.*`` — follow graph."""

from __future__ import annotations

from typing import Any

from ..models import ProfileBasic
from ._base import Resource, parse_list, parse_model


class GraphResource(Resource):
    async def follow(self, account: str) -> dict[str, Any]:
        """Follow an account (DID or handle). Requires auth."""
        return await self._transport.procedure(
            "app.rocksky.graph.followAccount",
            params={"account": account},
            auth=True,
        ) or {}

    async def unfollow(self, account: str) -> dict[str, Any]:
        return await self._transport.procedure(
            "app.rocksky.graph.unfollowAccount",
            params={"account": account},
            auth=True,
        ) or {}

    async def get_followers(
        self,
        actor: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        dids: list[str] | str | None = None,
    ) -> FollowList:
        data = await self._transport.query(
            "app.rocksky.graph.getFollowers",
            params={"actor": actor, "limit": limit, "cursor": cursor, "dids": dids},
        )
        return _parse_follow_list(data, "followers")

    async def get_follows(
        self,
        actor: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
        dids: list[str] | str | None = None,
    ) -> FollowList:
        data = await self._transport.query(
            "app.rocksky.graph.getFollows",
            params={"actor": actor, "limit": limit, "cursor": cursor, "dids": dids},
        )
        return _parse_follow_list(data, "follows")

    async def get_known_followers(
        self,
        actor: str,
        *,
        limit: int | None = None,
        cursor: str | None = None,
    ) -> FollowList:
        data = await self._transport.query(
            "app.rocksky.graph.getKnownFollowers",
            params={"actor": actor, "limit": limit, "cursor": cursor},
            auth=True,
        )
        return _parse_follow_list(data, "followers")


class FollowList:
    """Paged list of profile entries with the queried subject attached."""

    __slots__ = ("count", "cursor", "entries", "subject")

    def __init__(
        self,
        subject: ProfileBasic | None,
        entries: list[ProfileBasic],
        cursor: str | None,
        count: int | None,
    ) -> None:
        self.subject = subject
        self.entries = entries
        self.cursor = cursor
        self.count = count

    def __iter__(self) -> Any:
        return iter(self.entries)

    def __len__(self) -> int:
        return len(self.entries)

    def __getitem__(self, index: int) -> ProfileBasic:
        return self.entries[index]


def _parse_follow_list(data: Any, list_key: str) -> FollowList:
    if not isinstance(data, dict):
        return FollowList(None, [], None, None)
    subject_raw = data.get("subject")
    subject = parse_model(ProfileBasic, subject_raw) if subject_raw else None
    return FollowList(
        subject=subject,
        entries=parse_list(ProfileBasic, data, key=list_key),
        cursor=data.get("cursor"),
        count=data.get("count"),
    )
