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

Jobs and checkpoints are retained by default so deduplication and manual replay
remain possible. Monitor disk growth, oldest pending job age, failed counts and
indexing lag. Never delete pending/processing jobs. A future retention policy must
preserve deduplication identities for the supported replay window.

## Verification

```sh
cargo test -p rocksky-submissions --no-default-features --features sqlite
cargo check -p rocksky-submissions
cargo check -p rocksky-jetstream --all-features
# Use an isolated test database; tests create queue tables and scoped test rows.
SUBMISSIONS_TEST_POSTGRES_URL='postgres://localhost/testdb' \
  cargo test -p rocksky-submissions --all-features postgres_queue_contract -- --ignored
```

The backend contract covers competing consumers, fencing, retry scheduling,
dead-lettering, step reuse and independent source cursors. SQLite also has an
abrupt child-process exit test proving committed jobs/checkpoints survive without
graceful connection shutdown.
