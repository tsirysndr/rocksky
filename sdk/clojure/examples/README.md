# Examples

Runnable scripts that exercise the Rocksky Clojure SDK end-to-end against a
real API.

## Configuration

Authenticated examples read their bearer token from the environment:

| variable          | purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `ROCKSKY_BASE_URL`| API base URL. Defaults to `https://api.rocksky.app`. |
| `ROCKSKY_TOKEN`   | Bearer token for authenticated endpoints.            |

## Running

From the `sdk/clojure/` directory:

```sh
# Run as a one-shot script
clojure -M -e "(load-file \"examples/01_quickstart.clj\")"

# Or from a REPL
clj
user=> (load-file "examples/01_quickstart.clj")
```

Authenticated examples need a token in the environment:

```sh
ROCKSKY_TOKEN=eyJ... clojure -M -e "(load-file \"examples/04_scrobble_a_track.clj\")"
```

## The examples

| File | Shows |
|------|-------|
| [`01_quickstart.clj`](01_quickstart.clj)                 | Smallest possible call — fetch a profile, no auth. |
| [`02_pipe_friendly.clj`](02_pipe_friendly.clj)           | Build → auth → request → reshape in one `->` pipeline. |
| [`03_paginate_scrobbles.clj`](03_paginate_scrobbles.clj) | Lazy seq over an offset-based endpoint. |
| [`04_scrobble_a_track.clj`](04_scrobble_a_track.clj)     | Authenticated POST — submit a scrobble. |
| [`05_search_and_listen.clj`](05_search_and_listen.clj)   | Search hits → drill into recent listeners. |
| [`06_error_handling.clj`](06_error_handling.clj)         | Catching `ex-info` from non-2xx and reading the ex-data. |
| [`07_concurrent_requests.clj`](07_concurrent_requests.clj)| Share one client across threads with `pmap`. |
