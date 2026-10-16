# Jetstream sources

`JETSTREAM_VERSION=v1|v2|both` selects ingestion protocols (default `v1`).
V1 retains `JETSTREAM_SERVERS` (comma-separated) or `JETSTREAM_SERVER`.
V2 uses `JETSTREAM_V2_URLS` (comma-separated) or `JETSTREAM_V2_URL`.
The default v2 sources are both:

- `wss://jetstream.us-west.bsky.network`
- `wss://jetstream.us-east.bsky.network`

V2 connects to `/xrpc/network.bsky.jetstream.subscribeEvents` with the
`xrpc.v1.json` subprotocol and commit collection filters. Records are normalized
into the existing indexing payload. Durable job kind `jetstream.commit.v1` is a
workflow version, independent of the source protocol. Duplicate commits from
v1/v2 and multiple hosts share the existing DID/collection/rkey/rev job identity.
The queue records the first source that captured a job; logs and dashboard label
its protocol and host.

Each protocol/host has an independent durable cursor. V1 resumes timestamps with
a five-second overlap. V2 resumes an inclusive instance-local sequence; never
copy its sequence to a different host. `JETSTREAM_V2_CURSOR` is allowed only with
one v2 URL and is used only when that source has no saved cursor. V1 uses
`JETSTREAM_CURSOR` in microseconds. Keep URLs stable across restarts.

This implements live subscriptions, not archive/snapshot replay. If v2 reports
an outdated or future cursor, ingestion logs the error and reconnects without
advancing past missing data. Operator recovery/replay is required when upstream
retention no longer covers a saved cursor. Switching back to v1 uses its own
saved cursor; upstream replay retention still limits recovery.

Tests cover configuration, protocol envelopes, a local WebSocket handshake,
normalization, independent cursor persistence and cross-source deduplication on
SQLite and PostgreSQL. CI runs `cargo test -p rocksky-jetstream --all-features --lib`.

## Scrobble priority

Jetstream has separate durable claim lanes for `app.rocksky.scrobble` and all
other collections. An album/song backlog cannot occupy the scrobble lane; the
background lane keeps processing metadata even during continuous scrobble traffic.
FIFO ordering, retry times, leases, and crash recovery are preserved within each
lane. This changes dequeue scheduling, not job identities, payloads or cursors.

- `MAX_INFLIGHT_SCROBBLES`: total worker capacity, default **64**, range **2–1024**.
- `JETSTREAM_SCROBBLE_CONCURRENCY`: slots reserved for scrobbles, default the total minus
  one quarter reserved for metadata (minimum one), therefore **48** by default. Must be below the total.
- Remaining slots serve other collections: **16** by default.

Reserved slots do not spill over into metadata work, so new scrobbles can start
without waiting for a metadata batch to finish. Both lanes still share database
pools and database capacity; this does not eliminate database contention.
Existing indexed backlog rows use their stored collection; legacy rows without
collection metadata remain in the background lane and are not dropped.

Startup adds a small partial claim index for scrobble collections. On a busy
PostgreSQL installation, create it ahead of deployment without blocking writers:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_scrobble_active
ON rocksky_durable_jobs (kind,available_at,created_at,id)
WHERE collection='app.rocksky.scrobble' AND status IN ('pending','processing');
```

Restart `rocksky-jetstream` after deploying. No concurrency increase or Doppler
change is required to enable the default split. Existing running metadata jobs
finish normally or recover through their leases.
