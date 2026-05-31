"""Page through a feed generator until exhausted or until a page cap is hit.

Run:
    uv run python examples/follow_feed.py at://did:plc:.../app.rocksky.feed.generator/all
"""

from __future__ import annotations

import asyncio
import sys

from rocksky import Client


async def main(feed_uri: str, max_pages: int = 3) -> int:
    cursor: str | None = None
    seen = 0
    async with Client() as rocksky:
        for page in range(max_pages):
            feed = await rocksky.feed.get(feed_uri, limit=25, cursor=cursor)
            for item in feed.feed:
                s = item.scrobble
                if not s:
                    continue
                seen += 1
                stamp = s.date.isoformat() if s.date else "—"
                print(f"  [{stamp}]  {s.user:24s}  {s.artist} — {s.title}")
            cursor = feed.cursor
            print(f"--- end of page {page + 1}; cursor={cursor!r} ---")
            if not cursor:
                break
    print(f"\ntotal items: {seen}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: follow_feed.py <feed-at-uri>")
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
