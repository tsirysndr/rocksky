"""Fetch a profile and the most recent scrobbles for a handle.

Run:
    uv run python examples/quickstart.py alice.bsky.social
"""

from __future__ import annotations

import asyncio
import sys

from rocksky import Client, NotFoundError


async def main(handle: str) -> int:
    async with Client() as rocksky:
        try:
            profile = await rocksky.actor.get_profile(handle)
        except NotFoundError:
            print(f"no profile for {handle!r}")
            return 1

        print(f"{profile.display_name or profile.handle}  ({profile.did})")
        print(f"  joined: {profile.created_at}")
        print()

        scrobbles = await rocksky.scrobble.list(did=profile.did, limit=10)
        if not scrobbles:
            print("(no scrobbles yet)")
            return 0

        print("recent scrobbles:")
        for s in scrobbles:
            stamp = s.date.isoformat() if s.date else "—"
            print(f"  [{stamp}]  {s.artist} — {s.title}")
        return 0


if __name__ == "__main__":
    handle = sys.argv[1] if len(sys.argv) > 1 else "tsiry.dev"
    sys.exit(asyncio.run(main(handle)))
