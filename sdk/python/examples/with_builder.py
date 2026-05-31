"""Build a Client fluently — including retries, custom UA, and logging hooks.

Run:
    uv run python examples/with_builder.py alice.bsky.social
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

import httpx

from rocksky import ClientBuilder

log = logging.getLogger("rocksky.example")


def _on_request(req: httpx.Request) -> None:
    log.debug("→ %s %s", req.method, req.url.path)


def _on_response(res: httpx.Response) -> None:
    log.debug("← %s %s (%s ms)", res.status_code, res.url.path, res.elapsed.total_seconds() * 1000)


async def main(handle: str) -> int:
    logging.basicConfig(
        level=os.environ.get("LOGLEVEL", "INFO"),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    client = (
        ClientBuilder()
        .base_url(os.environ.get("ROCKSKY_BASE_URL", "https://api.rocksky.app"))
        .token(os.environ.get("ROCKSKY_TOKEN"))
        .timeout(10.0)
        .user_agent("rocksky-example/1.0")
        .header("x-client-name", "with-builder.py")
        .retries(3, backoff=0.25)
        .on_request(_on_request)
        .on_response(_on_response)
        .build()
    )

    async with client:
        profile = await client.actor.get_profile(handle)
        recent = await client.scrobble.list(did=profile.did, limit=5)

    print(f"{profile.display_name or profile.handle}  ({profile.did})")
    print(f"recent: {len(recent)} scrobble(s)")
    for s in recent:
        print(f"  · {s.artist} — {s.title}")
    return 0


if __name__ == "__main__":
    handle = sys.argv[1] if len(sys.argv) > 1 else "tsiry.dev"
    sys.exit(asyncio.run(main(handle)))
