"""Print a user's year-in-review summary.

Run:
    uv run python examples/wrapped.py alice.bsky.social 2024
"""

from __future__ import annotations

import asyncio
import json
import sys

from rocksky import Client


async def main(handle_or_did: str, year: int | None) -> int:
    async with Client() as rocksky:
        profile = await rocksky.actor.get_profile(handle_or_did)
        wrapped = await rocksky.stats.wrapped(profile.did, year=year)

    if not wrapped:
        print(f"no wrapped payload for {handle_or_did}")
        return 1

    print(json.dumps(wrapped, indent=2, default=str))
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: wrapped.py <handle-or-did> [year]")
        sys.exit(2)
    handle = sys.argv[1]
    year = int(sys.argv[2]) if len(sys.argv) > 2 else None
    sys.exit(asyncio.run(main(handle, year)))
