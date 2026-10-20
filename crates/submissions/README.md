# Durable submissions

`rocksky-submissions` owns scrobble acceptance, leased execution, retries and
checkpointed results. PostgreSQL is the default Cargo feature; SQLite is optional.
The standalone binary does not depend on Rocksky's main dual-backend data layer.

```text
POST /now-playing or createScrobble
  -> authenticated Rust intake -> committed job -> API publication callback -> PDS

Bluesky Jetstream
  -> committed inbox + per-source cursor -> Rust indexing worker -> appview DB
```

The API callback retains the existing OAuth/session and metadata code. Rust owns
the durable workflow; moving OAuth into Rust is not required. API success means
**accepted durably**, not already indexed. A completed publication job means the
PDS write or a persisted duplicate was confirmed. Jetstream indexing has its own
job and may finish later.

## Build and run

PostgreSQL (default):

```sh
cargo build --release -p rocksky-submissions
export SUBMISSIONS_DATABASE_URL='postgres://user:password@localhost/rocksky'
export SUBMISSIONS_SECRET='<random shared secret of at least 32 bytes>'
./target/release/rocksky-submissions
```

SQLite only:

```sh
cargo build --release -p rocksky-submissions --no-default-features --features sqlite
export SUBMISSIONS_DATABASE_URL='sqlite:///var/lib/rocksky/submissions.sqlite?mode=rwc'
export SUBMISSIONS_SECRET='<same shared secret configured on the API>'
./target/release/rocksky-submissions
```

Create the parent directory first and use persistent **local** storage. SQLite
connections use WAL, `synchronous=FULL`, foreign keys and a five-second busy timeout.
In-memory queues are rejected. PostgreSQL connections use `synchronous_commit=on`.
Neither setting substitutes for backups or replicated failover.

For either backend in one standalone binary, build with `--features sqlite`.
The URL selects the backend at runtime; selecting an uncompiled backend fails.

The daemon also exposes `rockskyd submissions`. Its queue features are
`submissions-postgres` (default) and `submissions-sqlite`:

```sh
cargo build --release -p rockskyd --no-default-features --features submissions-sqlite
./target/release/rockskyd submissions
```

Other daemon services still have their existing database dependencies. The feature
flags above select the **durable queue** backend, not the entire appview backend.

## Local queue benchmark

Use a disposable local PostgreSQL database named `rocksky_queue_bench`:

```sh
cargo run --release --locked -p rocksky-submissions --example queue_bench -- \
  postgres://queuebench@127.0.0.1:55439/rocksky_queue_bench 20000 2
```

The arguments after the URL are jobs per case and repetitions. The benchmark
**truncates the queue tables between cases** and refuses a remote host or another
database name. It uses the actual queue and worker implementations, their default
10-connection queue pool, and 8, 32, and 128 worker slots. Cases cover a no-op
handler, a checkpoint lookup/write without application work, and that same
checkpoint handler with fair scheduling (64 actors, per-actor cap 4, idle borrowing).

Each case enqueues jobs through 32 concurrent producers, then drains the backlog.
CSV output separates enqueue throughput, durably completed jobs per second, and
jobs divided by combined enqueue/drain time. Producers and consumers do not run
simultaneously; these are finite backlog measurements, not sustained streaming or
HTTP throughput. Completion is checked in PostgreSQL after handlers return, with
up to approximately 10 ms of polling overhead. A 500-job warmup is marked trial 0.
Cases refresh planner statistics before draining; startup, truncation, and analyze
time are excluded. Failures or retries invalidate a case. No PDS, catalog, OAuth,
network API, or external indexing work runs. Durability settings are printed with
the results; interpret local storage results in the context of those settings.

## systemd

The repository includes [`rocksky-submissions.service`](../../systemd/rocksky-submissions.service).
It uses the existing `/root/github/rocksky` deployment and Doppler conventions:

```sh
cargo build --release -p rocksky-submissions
sudo install -m 0644 systemd/rocksky-submissions.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rocksky-submissions.service
sudo journalctl -u rocksky-submissions.service -f
```

Configure the queue URL and shared secret in Doppler before starting it, and
configure the same secret in both API processes. An optional
`/etc/default/rocksky-submissions` supplies additional environment settings.
For SQLite, build the standalone binary with `--no-default-features --features sqlite` and use
`sqlite:///var/lib/rocksky-submissions/submissions.sqlite?mode=rwc`; systemd
creates that persistent directory with mode `0700`.

The unit allows 240 seconds for shutdown so active jobs can drain, and orders
itself after `rocksky.service` so it stops before the REST API during a combined
shutdown. The API is managed separately; the worker retries callbacks while it
is unavailable.

## Configuration and rollout

| Variable | Where | Default |
| --- | --- | --- |
| `SUBMISSIONS_DATABASE_URL` | Worker and Jetstream | Required, no implicit fallback |
| `SUBMISSIONS_SECRET` | Worker and both API processes | Required for submission traffic; at least 32 bytes |
| `SUBMISSIONS_BIND` | Worker | `127.0.0.1:8098` |
| `SUBMISSIONS_URL` | API | `http://127.0.0.1:8098` |
| `SUBMISSIONS_API_URL` | Worker | `http://127.0.0.1:8000/internal/submissions/process` |
| `SUBMISSIONS_CONCURRENCY` | Worker | `8` |
| `SUBMISSIONS_TEAL_CONCURRENCY` | Worker | `4` (independent Teal pool) |
| `SUBMISSIONS_TEAL_API_URL` | Worker | `/tealfm/process` alongside `SUBMISSIONS_API_URL` |
| `SUBMISSIONS_MAX_ATTEMPTS` | Worker | `20` |
| `MAX_INFLIGHT_SCROBBLES` | Jetstream | `64` |

Start the worker and configure the API secret before sending submissions to the
new API. Deploy the REST callback and XRPC acceptance changes together. Queue
unavailability returns a retryable error; there is no in-memory fallback. Existing
REST/XRPC success bodies are retained. REST additionally returns `X-Submission-Id`.

Configure Jetstream's queue URL before restarting it. Existing appview database
settings still control where indexing writes. Source events and their receive
cursors are committed atomically to the queue database. On a fresh queue, set
`JETSTREAM_CURSOR` to replay a chosen start time; otherwise ingestion starts live.
Subsequent starts use each source's saved cursor with a five-second overlap.
Upstream replay retention still bounds recovery of events never captured locally.

Do not expose the worker's internal endpoints publicly. Both intake and the API
callback require `X-Rocksky-Submissions-Secret`. Use a private network and TLS when
crossing hosts. No user OAuth tokens are saved in queue payloads.

## Recovery contract

The design borrows DBOS's persisted workflow identity and completed-step results,
but is a small purpose-built worker, not a general deterministic replay engine.
See [DBOS architecture](https://docs.dbos.dev/architecture).

- `scrobble.publish.v1` checkpoints `publish-pds.v1`; `jetstream.commit.v1`
  checkpoints `index.v1`. Keep these versions stable for pending jobs across
  deployment. Introduce a new version and retain old handlers when changing the
  payload or step contract incompatibly.
- The first accepted submission freezes its timestamp and a lexicon-compatible
  PDS TID in the stored payload. Retrying the same job never generates a new key.
- PDS writes use create-only `putRecord` (`swapRecord: null`). After an ambiguous
  response, the API looks up that same record. Confirmed records are not rewritten.
- Workers claim jobs atomically (`SKIP LOCKED` on Postgres; a single atomic UPDATE
  on SQLite), hold no database transaction during network calls, and renew
  120-second leases every 40 seconds.
- PostgreSQL records a checkpoint with one atomic statement containing the lease
  fence and step insert, reducing four network round trips to one. SQLite retains
  its transaction. Repeated checkpoints preserve the original result.
- Every state transition and checkpoint checks the lease token and expiry. An
  expired worker cannot finalize its replacement's work. A remote request may
  outlive cancellation, so stable remote keys are still necessary.
- Temporary errors retry with exponential backoff and jitter, capped near
  15 minutes. Exhausted attempts and permanent input errors stay `failed` for
  inspection/replay. Authentication expiry remains retryable so a fresh login
  can unblock work; jobs exhausting retries require manual replay.
- One dispatcher polls each kind per process; adding execution slots does not
  multiply idle polling. Shutdown drains publication work; forced termination
  is recovered through lease expiry.

Clients should send a stable `Idempotency-Key` for retries, especially when omitting
the listening timestamp. Timestamped requests otherwise derive a key from listener,
title, artist, album and listening time. Changed content under the same key is
rejected; the original payload remains authoritative. Requests without either a
timestamp or explicit key are distinct submissions.

Multiple workers can share a PostgreSQL queue. SQLite workers must share the same
local file on the same host; do not put WAL files on a network filesystem. API
hosts may call a single queue service remotely. OAuth session storage remains the
API's existing responsibility.

This change makes acceptance/publication and captured Jetstream indexing durable.
Existing NATS fan-out, Discord delivery, metadata hydration and other subscribers
are **not** made transactional by these checkpoints. A transactional outbox for
those side effects remains separate work; no exactly-once claim is made for them.

## Inspect and replay

Internal endpoints (all require the shared-secret header):

- `POST /v1/submissions`: `{did, idempotencyKey, track}`; returns 202 only after
  persistence, 409 for a reused key with different content, 503 on storage failure.
- `GET /v1/jobs/{id}`: status, attempts, timestamps and sanitized error. Payload and
  lease token are omitted.
- `POST /v1/jobs/{id}/retry`: requeues a failed job, preserving its ID, payload and
  completed checkpoints. Returns 409 for a job that is not failed.

Find pending/failed work in either backend:

```sql
SELECT kind, status, count(*), min(created_at)
FROM rocksky_durable_jobs GROUP BY kind, status;

SELECT id, kind, attempts, last_error
FROM rocksky_durable_jobs WHERE status = 'failed';
```

### Automatic retention

The submissions service runs a cleanup task for **all queue kinds** in its database,
including Jetstream jobs. Keep the submissions service running even if only
Jetstream uses the queue. These settings are read at service startup and work with
both PostgreSQL and SQLite:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SUBMISSIONS_CLEANUP_ENABLED` | `true` | Set `false` to retain everything and stop cleanup |
| `SUBMISSIONS_COMPLETED_RETENTION_SECONDS` | `604800` (7 days) | Keep full completed payloads and checkpoints for this long after completion |
| `SUBMISSIONS_DEDUP_RETENTION_SECONDS` | `7776000` (90 days) | Total deduplication retention after completion; `0` retains compact records forever |
| `SUBMISSIONS_CLEANUP_INTERVAL_SECONDS` | `300` | Run one bounded cleanup pass every five minutes, also once at startup |
| `SUBMISSIONS_CLEANUP_BATCH_SIZE` | `500` | Maximum jobs compacted **and**, separately, maximum compact records deleted per pass (1–10000) |

Deduplication retention must be greater than completed retention, or zero. Completed
retention must be positive; interval must be 1–86400 seconds. Invalid settings fail
startup rather than silently applying a different policy.

After seven days, completed jobs keep their ID, request hash, status, attempt count,
and original completion time in the jobs table. Their large payloads and step
checkpoints are removed atomically. Publication jobs also retain their original PDS
record key and frozen listening timestamp in a small internal payload. The public
job response exposes `compacted_at` (epoch seconds; zero before compaction), but still
omits payloads. Duplicate requests return the same completed job; conflicting input
still returns 409. Completed jobs cannot be manually retried. The retained primary
key also prevents older producer binaries from recreating these jobs.

After 90 days, compact records are deleted. **Once deleted, the same idempotency
key can be accepted as new work and may publish again with a new record key.** Use
`SUBMISSIONS_DEDUP_RETENTION_SECONDS=0` if retries must remain deduplicated indefinitely;
compact records will then continue to grow. Retention runs in batches, so an expired
record may remain longer while a backlog drains. Shortening retention applies to
existing completed jobs on the next pass; disabling cleanup cannot restore already
removed data. Older worker binaries ignore these settings and do not run cleanup.

Pending, processing, failed jobs and source cursors are never cleaned automatically.
Failed jobs retain payloads/checkpoints for investigation and manual retry. Their
accumulation still requires monitoring and explicit operator action.

Cleanup uses row locks with `SKIP LOCKED` on PostgreSQL and short writer transactions
on SQLite. Multiple service replicas may clean safely. Each pass uses batched SQL,
logs compacted/deleted counts, and retries database errors on the next interval.
There is no `VACUUM FULL` or automatic SQLite `VACUUM`: PostgreSQL autovacuum and SQLite
freelist reuse allow future writes to reuse space; files need not immediately shrink.
Monitor queue size, oldest pending age, failed counts, cleanup errors and cleanup
throughput. At the defaults, one replica can compact and expire up to 144,000 jobs/day;
increase batch size or reduce the interval if ingestion outpaces that rate.

## Verification

```sh
cargo test -p rocksky-submissions --no-default-features --features sqlite
cargo check -p rocksky-submissions
cargo check -p rocksky-jetstream --all-features
# Use an isolated test database; tests create queue tables and scoped test rows.
SUBMISSIONS_TEST_POSTGRES_URL='postgres://localhost/testdb' \
  cargo test -p rocksky-submissions --all-features -- --include-ignored
```

The backend contract covers competing consumers, fencing, retry scheduling,
dead-lettering, step reuse and independent source cursors. Cleanup tests cover
legacy schema upgrades, atomic rollback, concurrent cleaners, batch limits,
protected job states, retained identities/conflicts, and deduplication expiry. SQLite also has an
abrupt child-process exit test proving committed jobs/checkpoints survive without
graceful connection shutdown.

For a real HTTP/process smoke test, build the standalone binary and run:

```sh
SUBMISSIONS_TEST_POSTGRES_URL='postgres://localhost/testdb' \
  python3 crates/submissions/tests/http_smoke.py target/release/rocksky-submissions
```

This requires `psql` and permission to create a temporary schema. It starts an
isolated worker and loopback callback, kills the worker during publication,
verifies recovery and a 503 retry, and checks that completed work is not published
again after restart or automatic payload cleanup. It removes its schema afterward and never contacts a PDS.

## Embedded operations dashboard

Open `/dashboard/` on the submissions service (the root redirects there). Browsing
is public. Clicking Retry opens a login prompt for `SUBMISSIONS_SECRET`, followed
by explicit confirmation. All mutation endpoints remain authenticated.
The React/Vite dashboard uses Jotai, TanStack Query,
Tailwind CSS, daisyUI, Tabler icons, and bundled DM Sans / IBM Plex Mono fonts.
Dark mode is the default; the theme preference persists locally. The service
secret is stored in this browser’s local storage for persistent retry access until
Disconnect removes it. It is never included in URLs or query keys and is not sent
with public dashboard reads. Use retry access only on a trusted browser.

The dashboard includes live status counts, a 60-minute completion chart, source
cursor age, filtered/keyset-paginated jobs, checkpoint inspection, explicit
confirmation before retrying failed jobs, and the effective cleanup policy.
Raw payloads, request fingerprints, lease tokens, and checkpoint results are
excluded from public responses. Stored error diagnostics are public, with
recognizable credentials and URL credentials/query strings redacted. Selected
song fields and the listener DID are public in job details.
Headline counters and activity poll every 2 seconds while visible; job lists poll
every 5 seconds, with pause and manual refresh.
The service shares a 30-second statistics snapshot across all clients. Set
`SUBMISSIONS_DASHBOARD_CACHE_SECONDS` (5–3600, default 30) to tune the interval.
Expired snapshots return immediately while one background refresh runs. On refresh
failure the last snapshot is retained, with retries limited to once per interval;
`as_of` remains the actual sample timestamp. The first request waits for a snapshot.
Job lists/details still poll every 5 seconds independently. Retained completed
totals are cached for 60 seconds. Cursor age measures the last captured event,
not necessarily source backlog. An active process is not proof of progress:
watch pending age and completed activity together.

The read-only dashboard API is public (no secret header required):

- `GET /v1/dashboard/overview`
- `GET /v1/dashboard/jobs?status=pending&kind=jetstream.commit.v1&limit=25`
- `GET /v1/dashboard/jobs/{id}`

The list supports an exact `id` and an opaque `before` cursor returned as `next`.
Use `jetstream_version=v1|v2` to filter by the first source that captured the job.
This combines with kind, status, search and pagination; jobs with unknown legacy
sources are included only when no version filter is selected.
The maximum page size is 100. Responses are `Cache-Control: no-store`.
The `q` parameter matches case-insensitive words across allowlisted scrobble fields
and job ID in the newest 2,000 jobs. Search updates after 180ms of typing; a shared
5-second metadata cache bounds database load. Older jobs remain accessible by ID.
Compacted scrobble fields cannot be searched.

Each new attempt records millisecond claim/outcome timestamps in the existing
fenced state transition, without another database round trip. The timeline shows
wall-clock processing time, queue/retry gaps, and live elapsed time. It is not a
trace of individual HTTP calls. Expired leases have unknown runtime and show their
lease boundary only. Older attempts are not reconstructed. Cleanup removes attempt
history with payloads; manual retries preserve history.

### Frontend development and builds

```sh
cd crates/submissions/dashboard
bun install --frozen-lockfile
bun run dev          # localhost:5173; /v1 proxies to localhost:8098
bun run test
bun run build
```

Commit both source and **dashboard/dist**, including fonts and hashed assets.
`build.rs` embeds every dist file using `include_bytes!`, including in release
builds. Building or running the Rust binary requires no Node/Bun installation,
frontend build step, CDN, or asset files beside the executable. CI rebuilds the
frontend and rejects a stale committed dist. `bun run check:dist` performs that
check locally after staging/committing the generated assets.

### CORS and reverse proxy

Same-origin hosting (including the Vite development proxy) needs no CORS setting.
For a separately hosted trusted frontend, set an exact comma-separated allowlist:

```sh
SUBMISSIONS_CORS_ORIGINS=https://queue.rocksky.app,http://localhost:5173
```

Origins must use HTTP(S), with no paths, trailing slashes, wildcard hosts, or
credentials. OPTIONS preflight permits GET/POST and the Content-Type and
X-Rocksky-Submissions-Secret headers. Cookie credentials are disabled, responses
vary by Origin, and unlisted origins receive no CORS permission. CORS does not
replace API authentication. Do not add wildcard CORS headers in the proxy.

Caddy configuration for the production dashboard (service stays on loopback):

```caddyfile
queue.rocksky.app {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8098
}
```

When deploying additive database migrations, restart **all long-lived queue
clients**, including Jetstream. Job queries use explicit column projections so
adding a column does not invalidate their PostgreSQL prepared result types.

### Collection activity

The overview groups completed Jetstream jobs by collection over the same last-hour
window as the throughput chart. It counts distinct retained jobs, including
successful skips and all operations, not unique scrobbles or delivery attempts.
Collection metadata is captured on intake and survives payload compaction.
Existing rows are not backfilled; these and malformed events appear as
Unknown / legacy. Publication jobs are excluded from this breakdown.
The existing cached completion query supplies collection buckets without a
separate payload scan. Restart Jetstream as well as submissions on deployment
so new inbox writes populate collection metadata.


## Durable Teal FM publication

Eligible enriched scrobbles persist a `tealfm.publish.v1` job through the
shared-secret protected `POST /v1/tealfm` endpoint **before** writing their Rocksky
scrobble record. Acceptance is awaited; a queue failure retries the parent rather
than silently losing the Teal write. Teal PDS failures only occupy the independent
Teal worker pool. The existing 60-second delay is stored in `available_at`, so it
survives restarts without holding a worker slot. This delay does not verify playback.

The parent submission ID identifies the child (imports use a listening identity
hash). The first accepted enriched payload, listening timestamp and generated TID
win; subsequent attempts do not replace them. Create-only PDS writes and lookup
recovery handle lost acknowledgements. Status failures retry without creating a
second play. Status time and ten-minute expiry derive from listening time; old
plays still publish, but expired or superseded status is skipped. CID comparisons
prevent concurrent retries from overwriting newer status.

Push preferences are checked at intake and processing. The mirror sends
`X-Rocksky-Mirror-Provider: tealfm`; the authenticated API persists `skipTeal` with
that submission, preventing an echo even after delays. The mirror also ignores
plays marked `submissionClientAgent: rocksky/...`. Existing recent-play dedup is
retained for older callers. No OAuth credentials are stored in queue payloads.

The public dashboard labels/filters Teal jobs and exposes allowlisted music fields.
Existing cleanup settings apply, including failed-job retention and the finite
idempotency retention window. No migration or new required Doppler variable is
needed. Deploy the submissions binary **before** the updated API (new endpoint),
then restart REST/XRPC API processes and the mirror binary. During the first step,
new callbacks cannot yet be produced; on rollback keep the new intake available
until API producers have rolled back. Older completed scrobbles are not backfilled.

### Dashboard freshness

The dashboard polls `/v1/dashboard/live` every two seconds while automatic
refresh is enabled. This read-only endpoint coalesces viewers for one second.
Waiting, active processing, failed, and rolling last-hour completion counts come
from one database statement, independently of the overview cache. Waiting includes
jobs scheduled for retry; expired leases are excluded from “Processing now.”
The endpoint also reads source cursors and recent completion buckets, which replace
their cached chart counterparts rather than being added twice.

Older chart history still uses `SUBMISSIONS_DASHBOARD_CACHE_SECONDS`; retained
all-time completed totals keep their separate 60-second cache. Neither cache
supplies the headline counters. The footer distinguishes the live counter sample
from the history snapshot. This is near-real-time polling, not an event stream:
query time and polling can add delay. Job lists/details continue polling every
five seconds. Activity failures show an explicit stale data warning without
advancing the activity timestamp.

Pipeline health starts with an **All queues** total matching the headline counters,
then shows each queue separately from the same live sample. For example, two
waiting Jetstream jobs plus eight waiting Teal FM jobs means ten waiting overall.

Status-filtered job pages use `rocksky_durable_jobs_dashboard_status_recent`, a
partial index on `(status, created_at DESC, id DESC)` excluding completed jobs.
For a large existing PostgreSQL queue, create this index concurrently before
restarting the upgraded service; the startup schema also creates it if absent.

Unhandled SQL uniqueness violations are permanent processor failures: the job
moves to `failed` after that attempt, preserving its payload, checkpoints, and
error for inspection and manual retry. Classification uses the typed SQL error
(including wrapped causes), not a message substring. Transient database errors
and foreign-key failures retain the existing retry policy.
