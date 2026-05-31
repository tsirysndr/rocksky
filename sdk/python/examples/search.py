"""Run a full-text search and group hits by entity type.

Run:
    uv run python examples/search.py "kate bush"
"""

from __future__ import annotations

import asyncio
import sys

from rocksky import Client


def classify(hit: dict[str, object]) -> str:
    """The search endpoint returns a heterogeneous union; sniff the shape."""
    if "title" in hit and "artist" in hit and "albumUri" in hit:
        return "song"
    if "title" in hit and "artist" in hit:
        return "album"
    if "name" in hit and "uri" in hit:
        return "artist"
    if "handle" in hit:
        return "profile"
    if "curatorHandle" in hit:
        return "playlist"
    return "unknown"


async def main(query: str) -> int:
    async with Client() as rocksky:
        results = await rocksky.feed.search(query)

    print(
        f"{results.estimated_total_hits or 0} hits  "
        f"({results.processing_time_ms or 0} ms)"
    )
    buckets: dict[str, list[dict[str, object]]] = {}
    for hit in results.hits:
        buckets.setdefault(classify(hit), []).append(hit)

    for kind, items in sorted(buckets.items()):
        print(f"\n{kind} ({len(items)})")
        for item in items[:10]:
            label = (
                item.get("title")
                or item.get("name")
                or item.get("handle")
                or item.get("id")
            )
            print(f"  · {label}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print('usage: search.py "<query>"')
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
