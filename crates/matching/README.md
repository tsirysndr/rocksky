# Rocksky matching service

One Rust policy exposed as `POST /v1/match`, with a reusable `resolve` function,
provider trait, and `MatchingClient`. It retrieves candidates from Rocksky's
catalog, Spotify, and the existing Deezer/MusicBrainz services. It does not write
scrobbles or mutate the catalog.

## Run

From the repository root:

```sh
cargo build --release -p rocksky-matching
DEEZER_URL=http://127.0.0.1:8090 \
MUSICBRAINZ_URL=http://127.0.0.1:8088 \
./target/release/rocksky-matching
```

Only configured providers are used. At least one is required.

| Variable               | Meaning                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `MATCHING_BIND`        | Bind address; default `127.0.0.1:8096`                                                                  |
| `DATABASE_URL`         | Optional Rocksky PostgreSQL or SQLite catalog; uses `rocksky-db`                                        |
| `DEEZER_URL`           | Existing Rocksky Deezer service, not the public API                                                     |
| `MUSICBRAINZ_URL`      | Existing Rocksky MusicBrainz service, not the public API                                                |
| `SPOTIFY_API_URL`      | Spotify API base, e.g. `https://api.spotify.com/v1`                                                     |
| `SPOTIFY_ACCESS_TOKEN` | Required when Spotify is configured; static access token (restart with a renewed token when it expires) |

`GET /health` is a process liveness check, not a provider readiness probe.
The default listener is local; use an authenticated internal gateway when
exposing it outside the host. Request JSON is capped at 16 KiB. There are 32
concurrent requests and an 8-second provider budget per request. External HTTP
calls have a 7-second timeout. No provider retry loops extend that budget.

## systemd

The unit in [`systemd/rocksky-matching.service`](../../systemd/rocksky-matching.service)
uses the existing deployment directory `/root/github/rocksky`, runs the release
binary, restarts on failure, and logs to the journal. It listens on
`127.0.0.1:8096` and uses the local Deezer and MusicBrainz services by default.
Those providers are ordered before matching when started together, but are not
required dependencies, so either can restart independently.

On the Linux deployment host, from the repository root:

```sh
cargo build --release -p rocksky-matching
sudo cp systemd/rocksky-matching.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/rocksky-matching.service
sudo systemctl daemon-reload
sudo systemctl enable --now rocksky-matching.service
sudo systemctl status rocksky-matching.service
journalctl -u rocksky-matching.service -f
```

Optional overrides and credentials belong in `/etc/default/rocksky-matching`
(systemd environment-file syntax, without `export`). For example:

```ini
MATCHING_BIND=127.0.0.1:8096
DEEZER_URL=http://127.0.0.1:8090
MUSICBRAINZ_URL=http://127.0.0.1:8088
```

Add `DATABASE_URL` to enable catalog lookup. To enable Spotify, supply both
`SPOTIFY_API_URL` and `SPOTIFY_ACCESS_TOKEN`. Protect this file with mode `0600`
when it contains credentials. Restart `rocksky-matching.service` after changing
it. The unit starts the binary directly and reads only its configured environment;
set any deployment secrets needed by this service in that file.

## Contract

```sh
curl -sS http://127.0.0.1:8096/v1/match \
  -H 'Content-Type: application/json' \
  --data '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Music Has the Right to Children","durationMs":151000}'
```

`title` and `artists` are required, nonblank, and limited to 1024 bytes per
field and 32 artists. Empty optional album values are invalid; omit an unknown
album. Unknown request fields are rejected to catch misspelled filters.

Optional fields: `album`, `albumArtist`, positive `durationMs`, and:

```json
{
  "identifiers": {
    "musicbrainzRecordingId": "recording-uuid",
    "musicbrainzReleaseId": "release-uuid",
    "isrc": "USABC1234567",
    "spotifyTrackId": "provider-id",
    "deezerTrackId": "123456"
  }
}
```

The identifiers above illustrate the field names; supply real identifiers.
Use an array of actual artist names. Do not split literal names such as
`Earth, Wind & Fire` on commas. For legacy catalog rows, a joined credit is
accepted only when it equals the entire requested credit list after normalization.

Responses contain `policyVersion`, `status`, `track`, ranked `candidates`,
`rejected` candidates with reasons, and `warnings`. `rank` is an ordering tuple,
not a probability. Only `matched` has a selected `track`; `ambiguous` and
`unmatched` have `track: null`. Equal-ranking distinct candidates stay ambiguous,
even though their presentation order is deterministic.

HTTP 400 means invalid input, 413 oversized JSON, 429 exhausted local capacity,
and 503 incomplete retrieval with no usable candidates. A healthy provider can
supply a validated match when another fails; `warnings` reports the unavailable
providers. A provider failure is never silently converted to `unmatched`.

## Matching policy

1. Validate every candidate's title and artist credits, regardless of its source
   or provider score. Every requested artist must be credited. Album artist
   cannot substitute for recording artist.
2. If `album` is supplied, require that album after safe normalization. Missing
   album metadata fails this filter. Never relax it, even for explicit IDs.
3. Keep version information. Plain text requests cannot select unmentioned live,
   remaster, remix, edit, or other marked versions. Check album metadata too, so
   a plain track title on a remastered album does not slip through.
4. A **verified explicit identifier** authorizes the identified version. In that
   case, recognized version suffixes may differ while the base title, artist,
   and supplied album must still match. Merely supplying an ID does not grant
   this exception. At least one supplied ID must be verified; known conflicting
   IDs reject the candidate. Missing IDs remain unknown, never inferred.
5. When both durations are known, require a difference no greater than 5 seconds
   or 2% of the requested duration, whichever is larger.
6. Rank compatible candidates by verified IDs, duration evidence, canonical
   album preference, release status, and preferred release country (XW/US).
   Repeated copies of the same provider record are deduplicated.

Normalization reuses `rocksky-core::credits::fold` for Unicode/diacritics and
adds limited punctuation/whitespace handling. It does not remove version words
or use substring artist matching. ISRC separators/case are normalized; Spotify
IDs remain case-sensitive.

## Reused rules and regression cases

- `apps/api/src/xrpc/app/rocksky/song/albumFilter.ts` and its tests: Thriller
  release fixtures, case-insensitive album filtering, canonical album/single
  preferences, missing album data. Previous wrong-album fallback expectations
  are intentionally reversed; equal-score ties become ambiguous.
- `crates/webscrobbler/src/scrobbler.rs` and `crates/scrobbler/src/scrobbler.rs`:
  accent-insensitive credits and provider fallback. Partial substring matching
  is replaced with complete normalized credits, and title checks are mandatory.
- Both crates' `musicbrainz/mod.rs`: official release and XW/US preferences,
  single-release detection. Nirvana/Nevermind, Joji/Chloe Burbank Vol. 1, and
  Linkin Park/Meteora cases are reproduced as offline fixtures, not live network
  tests. Dates and provider order do not silently break identity ambiguities.
- MusicBrainz raw `/search` is used instead of `/hydrate`, which can overwrite
  the returned title with the requested title. All returned releases are
  considered before album filtering.

## Clients and rollout

Rust callers can use `rocksky_matching::client::MatchingClient`, or call `resolve`
with their own provider candidates. Other languages use the same JSON endpoint:

```ts
const response = await fetch(`${matchingUrl}/v1/match`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title, artists: [artist], album }),
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Matching service: ${response.status}`);
const result = await response.json();
// Only publish result.track when result.status === "matched".
```

This crate is independently runnable. Existing ingestion/API handlers have not
been switched over automatically: their output/enrichment/persistence contracts
need explicit adapters to this result. When migrating them, remove their local
selection and wrong-album fallback rather than calling it after an `unmatched`
result. Do not reuse legacy caches keyed only by artist/title or identifier;
all request fields and the policy version affect the result.

Current limitations favor false negatives over wrong matches: catalog retrieval
uses SQL case-insensitive title or MBID/ISRC lookup (the final filter uses richer
Unicode normalization); upstream wrappers can return limited candidate sets;
MusicBrainz direct lookup exposes its chosen release; cross-provider records
are not merged on title alone; Spotify access-token refresh is not implemented yet. This service does not claim to discover version metadata
that a provider omits, and does not merge enrichment from unrelated tracks.

## Tests

```sh
cargo test --release -p rocksky-matching
cargo clippy --release -p rocksky-matching --all-targets --no-deps -- -D warnings
```

Tests cover policy, HTTP validation/errors/deadlines/capacity, SQLite catalog
lookups and ISRC collisions, and real HTTP calls to local mock providers.
No live provider credentials or internet access are required. Integration tests
need permission to bind loopback sockets.
