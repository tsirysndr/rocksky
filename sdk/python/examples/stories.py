"""Show the latest scrobble per user, optionally filtered by feed or who you follow.

Run:
    uv run python examples/stories.py
    ROCKSKY_TOKEN=<jwt> uv run python examples/stories.py
"""

from __future__ import annotations

import asyncio
import os

from rocksky import Client

METALCORE = "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/metalcore"
TRAP = "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/trap"
SYNTHWAVE = "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/synthwave"


def _print(label: str, stories: list) -> None:
    print(f"\n=== {label} ({len(stories)}) ===")
    for s in stories:
        print(f"  {s.handle:24s}  {s.artist} — {s.title}")


async def main() -> int:
    async with Client() as rocksky:
        recent = await rocksky.feed.stories(size=10)
        _print("recent", recent)

        for label, feed in (("metalcore", METALCORE), ("trap", TRAP), ("synthwave", SYNTHWAVE)):
            page = await rocksky.feed.stories(size=10, feed=feed)
            _print(label, page)

    token = os.environ.get("ROCKSKY_TOKEN")
    if token:
        async with Client(token=token) as rocksky:
            page = await rocksky.feed.stories(size=10, following=True)
            _print("from people I follow", page)
    else:
        print("\n(set ROCKSKY_TOKEN to also fetch the following timeline)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
