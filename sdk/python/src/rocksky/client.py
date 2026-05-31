"""Top-level async client for the Rocksky API."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from types import TracebackType
from typing import TYPE_CHECKING, Any

import httpx

from ._http import (
    DEFAULT_BASE_URL,
    DEFAULT_RETRY_BACKOFF,
    DEFAULT_TIMEOUT,
    HTTPTransport,
    RequestHook,
    ResponseHook,
)

if TYPE_CHECKING:
    from .builder import ClientBuilder
from .resources import (
    ActorResource,
    AlbumResource,
    ApikeyResource,
    ArtistResource,
    ChartsResource,
    DropboxResource,
    FeedResource,
    GoogleDriveResource,
    GraphResource,
    LikeResource,
    MirrorResource,
    PlayerResource,
    PlaylistResource,
    ScrobbleResource,
    ShoutResource,
    SongResource,
    SpotifyResource,
    StatsResource,
)


class Client:
    """Async client for the Rocksky XRPC API.

    Example:
        >>> async with Client(token="…") as rocksky:
        ...     me = await rocksky.actor.get_profile()
        ...     scrobbles = await rocksky.scrobble.list(did=me.did, limit=20)

    The client owns an :class:`httpx.AsyncClient` instance unless you pass one
    via ``http_client`` (handy when you want to share connection pools, mount
    your own transport, or test with ``respx``).
    """

    def __init__(
        self,
        *,
        token: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float | httpx.Timeout = DEFAULT_TIMEOUT,
        headers: Mapping[str, str] | None = None,
        http_client: httpx.AsyncClient | None = None,
        user_agent: str | None = None,
        retries: int = 0,
        retry_backoff: float = DEFAULT_RETRY_BACKOFF,
        request_hooks: Sequence[RequestHook] | None = None,
        response_hooks: Sequence[ResponseHook] | None = None,
    ) -> None:
        self._transport = HTTPTransport(
            base_url=base_url,
            token=token,
            timeout=timeout,
            headers=headers,
            http_client=http_client,
            user_agent=user_agent,
            retries=retries,
            retry_backoff=retry_backoff,
            request_hooks=request_hooks,
            response_hooks=response_hooks,
        )
        self.actor = ActorResource(self._transport)
        self.album = AlbumResource(self._transport)
        self.apikey = ApikeyResource(self._transport)
        self.artist = ArtistResource(self._transport)
        self.charts = ChartsResource(self._transport)
        self.dropbox = DropboxResource(self._transport)
        self.feed = FeedResource(self._transport)
        self.googledrive = GoogleDriveResource(self._transport)
        self.graph = GraphResource(self._transport)
        self.like = LikeResource(self._transport)
        self.mirror = MirrorResource(self._transport)
        self.player = PlayerResource(self._transport)
        self.playlist = PlaylistResource(self._transport)
        self.scrobble = ScrobbleResource(self._transport)
        self.shout = ShoutResource(self._transport)
        self.song = SongResource(self._transport)
        self.spotify = SpotifyResource(self._transport)
        self.stats = StatsResource(self._transport)

    @property
    def token(self) -> str | None:
        return self._transport.token

    def set_token(self, token: str | None) -> None:
        """Update the bearer token used for subsequent requests."""
        self._transport.set_token(token)

    @property
    def base_url(self) -> str:
        return self._transport.base_url

    @staticmethod
    def builder() -> ClientBuilder:
        """Shortcut for ``ClientBuilder()`` — handy when you've imported ``Client`` only."""
        from .builder import ClientBuilder

        return ClientBuilder()

    async def call(
        self,
        method: str,
        *,
        params: Mapping[str, Any] | None = None,
        body: Any = None,
        verb: str = "GET",
        auth: bool = False,
    ) -> Any:
        """Escape hatch — call any XRPC method, even ones not wrapped by a
        typed resource. Returns the parsed JSON body (or ``None`` for 204s).

        Example:
            >>> raw = await client.call(
            ...     "app.rocksky.feed.describeFeedGenerator", verb="GET"
            ... )
        """
        if verb.upper() == "POST":
            return await self._transport.procedure(
                method, params=params, body=body, auth=auth
            )
        return await self._transport.query(method, params=params, auth=auth)

    async def aclose(self) -> None:
        """Close the underlying HTTP client (if owned)."""
        await self._transport.aclose()

    async def __aenter__(self) -> Client:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()
