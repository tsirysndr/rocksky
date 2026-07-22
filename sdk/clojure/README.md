# Rocksky Clojure SDK

[![Clojars](https://img.shields.io/clojars/v/app.rocksky/sdk.svg)](https://clojars.org/app.rocksky/sdk)

Clojure bindings to the shared Rocksky Rust core (`rocksky-sdk`) via the JVM
**Panama FFM** API (`rocksky.core`, JDK 22+): AppView reads, AT Protocol PDS
writes (scrobble fan-out, like, follow, shout) and the identity hashes — the
same engine behind every Rocksky SDK.

## Install

deps.edn:

```clojure
app.rocksky/sdk {:mvn/version "0.3.0"}
```

The jar is native-free; the library is fetched from the GitHub release on first
use and cached (checksum-verified). For a local checkout, build it onto the
classpath: `./build-core.sh`. `mise.toml` pins a JDK with stable FFM + Clojure.

## Quickstart

```clojure
(require '[rocksky.core :as core])

;; Reads — unauthenticated. An optional trailing base overrides the AppView URL.
(core/global-stats)
(doseq [t (core/top-tracks 10 0)]
  (println (get t "artist") "—" (get t "title")))

;; Writes — log in once (session persisted at the given path).
(def agent (core/login "session.json" "alice.bsky.social" "app-password"))
(core/scrobble agent {"title" "Chaser" "artist" "Calibro 35"
                      "album" "Jazzploitation" "albumArtist" "Calibro 35"
                      "durationMs" 182320})
(core/agent-close agent)
```

Run with restricted native access enabled — the `:native` alias adds it:

```sh
clojure -M:native -e "(require 'rocksky.core)(println (rocksky.core/global-stats))"
clojure -M:native:nrepl        # nREPL with native access
clojure -M:native -m rocksky.native-example
```

## API

Reads/writes return plain Clojure maps/strings (the wire shape); write verbs
throw `ex-info` on an `{"error": …}` envelope. Records are maps with camelCase
string keys.

### Reads — `rocksky.core`

`(profile actor)`, `(scrobbles actor limit)`, `(top-tracks limit offset)`,
`(global-stats)` — each also accepts a trailing `base` to target a custom AppView.

### Writes — `rocksky.core`

`(login session-path identifier password)` → an opaque agent handle. Then
`(scrobble agent track)` (fans out to artist/album/song/scrobble),
`(like agent uri cid)`, `(follow agent did)`,
`(shout agent subject-uri subject-cid message)`, `(refresh-session agent)`,
`(agent-close agent)`.

### Identity hashes

`(song-hash title artist album)` — lowercase-hex SHA-256, identical to the server
and every other Rocksky SDK.

## Docs

`rocksky.core` / `rocksky.native` defer all native resolution behind `delay`, so
requiring the namespaces (e.g. for cljdoc) touches no native code.

## License

MIT.
