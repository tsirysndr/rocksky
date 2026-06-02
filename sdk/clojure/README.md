# Rocksky Clojure SDK

[![Clojars](https://img.shields.io/clojars/v/app.rocksky/sdk.svg)](https://clojars.org/app.rocksky/sdk)

An idiomatic, pipe-friendly Clojure client for the
[Rocksky](https://rocksky.app) XRPC API.

- **Plain maps in, plain maps out** — no records, no protocols to learn.
- **Client-first arg** — every endpoint threads through `->`.
- **No global state** — clients are values you can pass around and reuse
  across threads.
- **Two real verbs** — `query` (GET) and `procedure` (POST) cover the whole
  XRPC surface. Resource namespaces are thin wrappers on top.

## Install

`deps.edn`:

```clojure
{:deps {app.rocksky/sdk {:mvn/version "0.1.1-SNAPSHOT"}}}
```

Leiningen / Boot:

```clojure
[app.rocksky/sdk "0.1.1-SNAPSHOT"]
```

Or, to track a specific commit instead of a release:

```clojure
{:deps {app.rocksky/sdk {:git/url   "https://github.com/tsirysndr/rocksky"
                         :git/sha   "..."
                         :deps/root "sdk/clojure"}}}
```

## Quickstart

```clojure
(require '[rocksky.core :as rs])

(def client (rs/client))                ;; defaults to https://api.rocksky.app

(rs/get-profile client {:did "did:plc:7vdlgi2bflelz7mmuxoqjfcr"})
;; => {:handle "tsiry-sandratraina.com" :followersCount 42 ...}
```

For authenticated endpoints, pass a bearer token:

```clojure
(def client (rs/client {:token (System/getenv "ROCKSKY_TOKEN")}))

(require '[rocksky.scrobble :as scrobble])
(scrobble/create-scrobble client
                          {:title  "Paranoid Android"
                           :artist "Radiohead"
                           :album  "OK Computer"})
```

## Pipe-friendly composition

Clients are immutable values; every helper that mutates state returns a
new client. That makes it natural to build, authenticate, and call in one
threading expression:

```clojure
(require '[rocksky.client :as c]
         '[rocksky.actor  :as actor])

(-> (c/client {:base-url "https://api.rocksky.app"})
    (c/with-token (System/getenv "ROCKSKY_TOKEN"))
    (actor/get-profile {:did "did:plc:7vdlgi2bflelz7mmuxoqjfcr"})
    :handle)
;; => "tsiry-sandratraina.com"
```

Or reshape responses inline:

```clojure
(require '[rocksky.charts :as charts])

(->> (charts/get-top-tracks (c/client) {:limit 5})
     :tracks
     (map :title))
;; => ("Paranoid Android" "Karma Police" ...)
```

## Calling URLs the SDK doesn't wrap

Anything missing from the resource namespaces is one line away — the
generic `query` / `procedure` helpers accept any NSID.

```clojure
(c/query    client :app.rocksky.feed.describeFeedGenerator)
(c/procedure client :app.rocksky.shout.createShout {:message "hi"})
```

## Errors

Non-2xx responses throw `ex-info`. Catch it and inspect the ex-data:

```clojure
(try
  (album/get-album client {:uri "at://missing"})
  (catch clojure.lang.ExceptionInfo e
    (let [{:keys [status nsid body]} (ex-data e)]
      (println status nsid body))))
```

## Concurrency

A client is a value — share it across threads with `pmap` / `future`:

```clojure
(pmap #(actor/get-profile client {:did %}) handles)
```

## Available namespaces

| Namespace            | Wraps                            |
|----------------------|----------------------------------|
| `rocksky.actor`      | `app.rocksky.actor.*`            |
| `rocksky.album`      | `app.rocksky.album.*`            |
| `rocksky.apikey`     | `app.rocksky.apikey.*`           |
| `rocksky.artist`     | `app.rocksky.artist.*`           |
| `rocksky.charts`     | `app.rocksky.charts.*`           |
| `rocksky.dropbox`    | `app.rocksky.dropbox.*`          |
| `rocksky.feed`       | `app.rocksky.feed.*`             |
| `rocksky.googledrive`| `app.rocksky.googledrive.*`      |
| `rocksky.graph`      | `app.rocksky.graph.*`            |
| `rocksky.like`       | `app.rocksky.like.*`             |
| `rocksky.mirror`     | `app.rocksky.mirror.*`           |
| `rocksky.player`     | `app.rocksky.player.*`           |
| `rocksky.playlist`   | `app.rocksky.playlist.*`         |
| `rocksky.scrobble`   | `app.rocksky.scrobble.*`         |
| `rocksky.shout`      | `app.rocksky.shout.*`            |
| `rocksky.song`       | `app.rocksky.song.*`             |
| `rocksky.spotify`    | `app.rocksky.spotify.*`          |
| `rocksky.stats`      | `app.rocksky.stats.*`            |

## Conventions

- **Kebab-case Clojure side, camelCase wire side.** The SDK translates
  `:start-date` → `startDate`, `:album-art` → `albumArt`, etc., so you can
  write idiomatic Clojure params. The raw HTTP body / query string still
  uses camelCase, matching the lexicons under `apps/api/lexicons`.
- **Nil values are dropped.** Pass `:limit nil` and the param won't appear
  on the wire — handy for building params with `cond->`.
- **Booleans round-trip.** `:enabled false` is preserved (not coerced to
  nil) so toggles work correctly.

## Examples

Browse the [`examples/`](examples) directory:

| File | Shows |
|------|-------|
| `01_quickstart.clj`        | Smallest possible call |
| `02_pipe_friendly.clj`     | Threading construction → auth → request |
| `03_paginate_scrobbles.clj`| Lazy pagination over offset endpoints |
| `04_scrobble_a_track.clj`  | Authenticated POST |
| `05_search_and_listen.clj` | Search → drill down |
| `06_error_handling.clj`    | Catching `ex-info` from non-2xx |
| `07_concurrent_requests.clj`| `pmap` across a shared client |

## Types

Lexicon-derived schemas (in [malli](https://github.com/metosin/malli) form) are exposed as `rocksky.generated.types/schemas`, a map keyed by `:TypeName` keywords covering every lex `*View*` / `*Record` / `*Input` / `*Output` / `*Params` shape from [the Rocksky lexicons](https://tangled.org/rocksky.app/rocksky/tree/main/apps/api/lexicons). Regenerate with `bun run lexgen:types` at the repo root.


## Development

```bash
# Run the test suite
clojure -X:test

# Start an nREPL on localhost:7888
clojure -M:nrepl
```

The tests mock the HTTP layer by passing `:http-fn` to `client`, so they
run offline and finish in well under a second.

## Publishing

The SDK ships with a `tools.build` + `deps-deploy` pipeline. From this
directory:

```bash
clojure -T:build clean
clojure -T:build jar        # build the jar in target/
clojure -T:build install    # install locally to ~/.m2 for testing
clojure -T:build deploy     # publish to Clojars
```

Deploying needs Clojars credentials in the environment:

```bash
export CLOJARS_USERNAME=your-username
export CLOJARS_PASSWORD=your-clojars-deploy-token   # NOT your password
clojure -T:build deploy
```

Bump `version` in `build.clj` and add a new entry to `CHANGELOG.md`
before deploying. The default release tag pattern is
`sdk-clojure-v<version>`.

## License

[MIT](LICENSE) © Tsiry Sandratraina.
