CREATE TABLE IF NOT EXISTS rocksky_durable_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts BIGINT NOT NULL DEFAULT 0,
    available_at BIGINT NOT NULL,
    lease_until BIGINT NOT NULL DEFAULT 0,
    lease_token TEXT NOT NULL DEFAULT '',
    last_error TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_ready
    ON rocksky_durable_jobs (kind, status, available_at, created_at);
CREATE INDEX IF NOT EXISTS rocksky_durable_jobs_expired
    ON rocksky_durable_jobs (kind, status, lease_until);
CREATE TABLE IF NOT EXISTS rocksky_durable_steps (
    job_id TEXT NOT NULL REFERENCES rocksky_durable_jobs(id),
    name TEXT NOT NULL,
    result TEXT NOT NULL,
    completed_at BIGINT NOT NULL,
    PRIMARY KEY (job_id, name)
);
CREATE TABLE IF NOT EXISTS rocksky_durable_cursors (
    source TEXT PRIMARY KEY,
    cursor_value BIGINT NOT NULL
);
