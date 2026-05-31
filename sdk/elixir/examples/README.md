# Examples

Runnable scripts that exercise the Rocksky SDK end-to-end against a real API.

Each script reads its config from the environment:

| variable          | purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `ROCKSKY_BASE_URL`| API base URL. Defaults to `https://api.rocksky.app`. |
| `ROCKSKY_TOKEN`   | Bearer token for authenticated endpoints.            |
| `ROCKSKY_DID`     | Actor handle or DID used by most examples.           |

Run any example with `mix run`:

```sh
ROCKSKY_DID=alice.bsky.social mix run examples/get_profile.exs
ROCKSKY_DID=alice.bsky.social mix run examples/recent_scrobbles.exs
ROCKSKY_TOKEN=eyJ... mix run examples/scrobble_now.exs
```
