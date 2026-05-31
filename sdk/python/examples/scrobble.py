"""Submit a scrobble.

Reads the bearer token from $ROCKSKY_TOKEN. Override the API base URL with
$ROCKSKY_BASE_URL if you're hitting a self-hosted instance.

Run:
    ROCKSKY_TOKEN=... uv run python examples/scrobble.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import time

from rocksky import APIError, Client


async def main() -> int:
    token = os.environ.get("ROCKSKY_TOKEN")
    if not token:
        print("set $ROCKSKY_TOKEN first")
        return 1

    base_url = os.environ.get("ROCKSKY_BASE_URL", "https://api.rocksky.app")

    async with Client(base_url=base_url, token=token) as rocksky:
        try:
            result = await rocksky.scrobble.create(
                title="Hounds of Love",
                artist="Kate Bush",
                album="Hounds of Love",
                duration=298_000,
                year=1985,
                timestamp=int(time.time()),
            )
        except APIError as exc:
            print(f"scrobble failed: {exc}")
            return 1

    print("scrobble accepted:", result)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
