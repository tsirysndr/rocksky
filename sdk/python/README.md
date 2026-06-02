# rocksky — Python SDK

Async Python SDK for the [Rocksky](https://rocksky.app) XRPC API.

- **Async-first** (`asyncio`, built on `httpx.AsyncClient`)
- **Typed** — Pydantic v2 models for every common entity, snake_case API
- **Pythonic** — resource-style namespaces (`client.actor`, `client.scrobble`, …)
- **Escape hatch** — `client.call(method)` for any XRPC method not yet wrapped
- Works on **Python 3.10+**

## Install

This package is `uv`-native. From a project of your own:

```bash
uv add rocksky
```

Or with `pip`:

```bash
pip install rocksky
```

To work on the SDK itself:

```bash
git clone https://github.com/tsirysndr/rocksky
cd rocksky/sdk/python
uv sync           # creates .venv, installs runtime + dev deps
uv run pytest     # run the test suite
```

## Quickstart

```python
import asyncio
from rocksky import Client

async def main() -> None:
    async with Client() as rocksky:
        me = await rocksky.actor.get_profile("tsiry-sandratraina.com")
        print(me.display_name, "—", me.did)

        recent = await rocksky.scrobble.list(did=me.did, limit=10)
        for s in recent:
            print(f"  {s.artist} — {s.title}")

asyncio.run(main())
```

### Authenticating

The Rocksky API uses a JWT bearer token. Pass it to the client:

```python
async with Client(token="eyJhbGciOi…") as rocksky:
    await rocksky.scrobble.create(
        title="Hounds of Love",
        artist="Kate Bush",
        album="Hounds of Love",
        duration=298000,
    )
```

You can also flip tokens mid-session:

```python
rocksky.set_token(new_jwt)
```

### Self-hosting / custom base URL

Default base URL is `https://api.rocksky.app`. Override for self-hosted instances:

```python
Client(base_url="http://localhost:8000", token=...)
```

### Fluent builder

If you prefer chainable configuration over a wide keyword-arg constructor —
or you want to add retries, logging hooks, or custom headers — use
`ClientBuilder`:

```python
from rocksky import ClientBuilder

rocksky = (
    ClientBuilder()
    .base_url("https://api.rocksky.app")
    .token(os.environ["ROCKSKY_TOKEN"])
    .timeout(10.0)
    .user_agent("my-app/1.0")
    .header("x-request-id", "trace-abc")
    .retries(3, backoff=0.5)              # retry transport errors + 5xx
    .on_request(lambda r: log.debug("→ %s %s", r.method, r.url))
    .on_response(lambda r: log.debug("← %s", r.status_code))
    .build()
)

async with rocksky:
    profile = await rocksky.actor.get_profile("tsiry-sandratraina.com")
```

A few notes:

- Every setter returns `self`, so chain freely.
- Hooks may be sync **or** async — the SDK awaits them when needed. They fire
  on every attempt (useful for tracing retries).
- `retries(n)` retries on `TransportError` and any `5xx` response with
  exponential backoff (`backoff * 2**attempt`). `4xx` responses are surfaced
  immediately.
- `Client.builder()` is a shortcut if you only imported `Client`.
- All builder options are also available as keyword args to `Client(...)` —
  the builder is sugar, not the only path.

## Try it in IPython

The SDK is async-only, so the regular Python REPL needs `asyncio.run(...)` for every
call. IPython's autoawait is much friendlier — `await` works at the prompt:

```bash
uv run --with ipython ipython
```

Then:

```python
In [1]: %autoawait
Out[1]: {'autoawait': True, 'autoawait_loop': 'asyncio'}

In [2]: from rocksky import Client

In [3]: rocksky = Client()       # base_url defaults to https://api.rocksky.app

In [4]: me = await rocksky.actor.get_profile("tsiry-sandratraina.com")

In [5]: me.display_name
Out[5]: 'Tsiry Sandratraina'

In [6]: recent = await rocksky.scrobble.list(did=me.did, limit=5)

In [7]: [(s.artist, s.title) for s in recent]
Out[7]: [('Kate Bush', 'Hounds of Love'), …]

In [8]: await rocksky.aclose()    # tidy up when done
```

Jupyter notebooks behave the same — `await` works at the top level of a cell out of
the box. For other shells (`ptpython`, plain `python -m asyncio`), see your REPL's
autoawait support.

## Resources

The client groups endpoints by namespace. Selected highlights:

| Namespace | Methods |
|-----------|---------|
| `actor` | `get_profile`, `get_albums`, `get_artists`, `get_songs`, `get_scrobbles`, `get_loved_songs`, `get_playlists`, `get_neighbours`, `get_compatibility` |
| `album` | `get`, `list`, `get_tracks` |
| `artist` | `get`, `list`, `get_albums`, `get_tracks`, `get_listeners`, `get_recent_listeners` |
| `song` | `get`, `list`, `match`, `get_recent_listeners`, `create` |
| `scrobble` | `get`, `list`, `create` |
| `charts` | `top_tracks`, `top_artists`, `scrobbles_chart` |
| `feed` | `get`, `search`, `stories`, `recommendations`, `artist_recommendations`, `album_recommendations`, `get_generator`, `list_generators` |
| `graph` | `follow`, `unfollow`, `get_followers`, `get_follows`, `get_known_followers` |
| `shout` | `create`, `reply`, `remove`, `report`, `for_profile`, `for_album`, `for_artist`, `for_track`, `replies` |
| `like` | `like_song`, `dislike_song`, `like_shout`, `dislike_shout` |
| `playlist` | `get`, `list`, `create`, `remove`, `start`, `insert_files`, `insert_directory` |
| `player` | `currently_playing`, `queue`, `play`, `pause`, `next`, `previous`, `seek`, `play_file`, `play_directory`, `add_items_to_queue`, `add_directory_to_queue` |
| `spotify` | `currently_playing`, `play`, `pause`, `next`, `previous`, `seek` |
| `apikey` | `list`, `create`, `update`, `remove` |
| `stats` | `get`, `wrapped` |
| `mirror` | `list_sources`, `put_source` |
| `dropbox` / `googledrive` | `list_files`, `get_file`, `download_file`, … |

For any endpoint that isn't wrapped (or hasn't been added yet), use the generic
escape hatch:

```python
raw = await rocksky.call(
    "app.rocksky.feed.describeFeedGenerator", verb="GET"
)
```

## Errors

All errors derive from `RockskyError`:

```python
from rocksky import (
    APIError,
    AuthenticationError,    # 401
    PermissionError,        # 403
    NotFoundError,          # 404
    RateLimitError,         # 429
    ServerError,            # 5xx
    TransportError,         # network / timeout
)

try:
    await rocksky.song.get(uri="at://does-not-exist")
except NotFoundError as e:
    print(e.status_code, e.error, e.message)
```

`APIError` exposes `status_code`, `method`, `error`, `message`, and `body`.

## Types

Public model types are derived from the [Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons) and live in `rocksky.gen.models` (Pydantic) and `rocksky.gen.types` (dataclasses). `rocksky.models` re-exports the Pydantic shapes under their historical SDK names. Regenerate with `bun run lexgen:types` at the repo root.


## Testing your code against the SDK

Inject your own `httpx.AsyncClient` so you can mount a mock transport:

```python
import httpx
from rocksky import Client

transport = httpx.MockTransport(lambda req: httpx.Response(200, json={"hits": []}))
external = httpx.AsyncClient(transport=transport)

async with Client(http_client=external) as rocksky:
    await rocksky.feed.search("kate bush")

await external.aclose()
```

The SDK's own tests use [`respx`](https://lundberg.github.io/respx/) — see the
`tests/` directory for patterns.

## Examples

Runnable example scripts live in [`examples/`](examples/):

- `examples/quickstart.py` — fetch a profile and recent scrobbles
- `examples/scrobble.py` — submit a scrobble (requires `ROCKSKY_TOKEN`)
- `examples/wrapped.py` — print someone's year-in-review summary
- `examples/search.py` — search and pretty-print hits
- `examples/follow_feed.py` — page through the follow-graph feed
- `examples/with_builder.py` — fluent builder with retries + request/response hooks

Run them with:

```bash
uv run python examples/quickstart.py tsiry-sandratraina.com
```

## License

[MIT](LICENSE) © Tsiry Sandratraina.
