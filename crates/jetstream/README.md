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
Retry times, leases, and crash recovery are preserved. FIFO claim ordering is
preserved within each DID and lane; different DIDs take turns. This changes dequeue scheduling, not job identities, payloads or cursors.

- `MAX_INFLIGHT_SCROBBLES`: total worker capacity, default **64**, range **2–1024**.
- `JETSTREAM_SCROBBLE_CONCURRENCY`: slots reserved for scrobbles, default the total minus
  one quarter reserved for metadata (minimum one), therefore **48** by default. Must be below the total.
- Remaining slots serve other collections: **16** by default.
- `JETSTREAM_MAX_INFLIGHT_PER_DID`: normal live-job allocation per DID **per lane**,
  default **4**, range **1–256**. Enforced across consumers sharing the database.
- `JETSTREAM_FAIR_BORROW_IDLE`: default **true**. After normal fair claims find no
  eligible account, bulk work may borrow idle capacity, leaving one normal DID
  allocation free in each lane. With defaults a busy DID can reach **44 scrobble**
  and **12 background** jobs, leaving four slots in each lane for other DIDs.
  Set **false** for a strict per-DID cap.

Each claim shares its batch between eligible DIDs, rotating accounts using a
persistent turn counter. Claims use bounded per-account FIFO index reads. New/quiet accounts bypass a single account's old bulk
backlog. An indexed actor registry avoids sorting the entire backlog on each
claim. A short database scheduling lock prevents replicas from racing past the
cap; it is released before job execution. Missing DIDs share a capped `unknown`
bucket. All jobs remain durable, including existing backlog upgraded at startup.

Normal fair claims run before borrowing, so a bulk backlog cannot jump ahead of
eligible quieter DIDs. Borrowed jobs finish normally; they are not preempted.
Borrowing is disabled automatically when the lane is too small to leave a normal
allocation free. Legacy FIFO consumers do not enforce these limits, so restart
all Jetstream consumers when upgrading.

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

Fair scheduling also adds an `actor` column, a small actor-turn table, registration
triggers and actor indexes. For a busy PostgreSQL queue, add the column and build
these indexes concurrently before restarting (the application creates the table
and triggers automatically):

```sql
ALTER TABLE rocksky_durable_jobs ADD COLUMN IF NOT EXISTS actor TEXT NOT NULL DEFAULT '';
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_actor_ready
ON rocksky_durable_jobs(kind,actor,available_at,created_at,id)
WHERE status IN ('pending','processing');
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_actor_scrobbles
ON rocksky_durable_jobs(kind,actor,available_at,created_at,id)
WHERE collection='app.rocksky.scrobble' AND status IN ('pending','processing');
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_actor_background
ON rocksky_durable_jobs(kind,actor,available_at,created_at,id)
WHERE collection<>'app.rocksky.scrobble' AND status IN ('pending','processing');
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_actor_leases
ON rocksky_durable_jobs(kind,actor,lease_until) WHERE status='processing';
CREATE INDEX CONCURRENTLY IF NOT EXISTS rocksky_durable_jobs_actor_backfill
ON rocksky_durable_jobs(kind,id) WHERE actor='' AND status<>'completed';
```

Restart `rocksky-jetstream` after deploying. No concurrency increase or Doppler
change is required to enable the default split. Existing running metadata jobs
finish normally or recover through their leases.

## Exact scrobble replays

Before opening an indexing transaction for a scrobble create, Jetstream checks the
primary database for the same record URI, listening timestamp and track content
hash. Exact matches complete through the durable worker without repeating catalog
writes or notifications. Missing or changed records use the normal indexing and
deduplication path. This is particularly useful when replaying a historical inbox.

### Scrobble indexing write batch

PostgreSQL indexes a scrobble's album-track, artist-track, artist-album links and
listen row in one data-modifying CTE statement inside the existing transaction.
This reduces that stage from 4–7 database round trips to one; catalog resolution
still precedes it. No collection window or cross-job transaction is introduced,
so jobs retain independent leases, retries and notification deduplication. SQLite
keeps the transactional sequential path because it has no data-modifying CTEs.
An existing user/track/timestamp returns no new listen ID and skips notification;
any statement failure rolls back the job's catalog and listen writes together.

Webhook producers and the blocking Redis consumer only lock shared configuration
long enough to clone it. Connection setup, enqueueing, and blocking pops run
outside that lock so a slow Redis operation cannot serialize scrobble workers.
