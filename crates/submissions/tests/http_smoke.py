#!/usr/bin/env python3
"""Exercise the real worker binary against an isolated Postgres schema.

Requires psql and SUBMISSIONS_TEST_POSTGRES_URL (falls back to the worker's
SUBMISSIONS_DATABASE_URL for deployment verification). Does not contact a PDS:
the callback is an ephemeral loopback HTTP server. Test rows live in a uniquely
named schema that is removed afterward; existing queue tables are never used.
"""

import copy
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    binary = Path(sys.argv[1] if len(sys.argv) > 1 else "target/release/rocksky-submissions").resolve()
    assert binary.is_file(), f"build the worker first: {binary}"
    database = os.environ.get("SUBMISSIONS_TEST_POSTGRES_URL") or os.environ["SUBMISSIONS_DATABASE_URL"]
    assert urllib.parse.urlsplit(database).scheme in ("postgres", "postgresql")
    schema = "submissions_smoke_" + secrets.token_hex(8)
    assert re.fullmatch(r"submissions_smoke_[a-f0-9]{16}", schema)

    def sql(statement):
        result = subprocess.run(
            ["psql", "-X", "-qAt", "--dbname", database, "-v", "ON_ERROR_STOP=1", "-c", statement],
            capture_output=True, text=True, timeout=20,
        )
        # Avoid printing connection strings or credentials from driver errors.
        if result.returncode:
            raise RuntimeError("psql failed during isolated smoke test")
        return result.stdout.strip()

    parts = urllib.parse.urlsplit(database)
    params = dict(urllib.parse.parse_qsl(parts.query))
    params["options"] = params.get("options", "") + f" -csearch_path={schema}"
    test_database = urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(params)))
    secret = secrets.token_hex(32)
    calls = []
    first_call = threading.Event()
    release_first = threading.Event()
    calls_lock = threading.Lock()

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            assert self.headers.get("X-Rocksky-Submissions-Secret") == secret
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            with calls_lock:
                calls.append(payload)
                count = len(calls)
            if count == 1:
                first_call.set()
                release_first.wait(20)  # worker is killed while this request is in flight
            status = 503 if count <= 2 else 200
            body = json.dumps({"status": "published", "submissionId": payload["submissionId"]}).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass  # expected when the worker is deliberately killed

    callback = ThreadingHTTPServer(("127.0.0.1", 0), Callback)
    threading.Thread(target=callback.serve_forever, daemon=True).start()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = {
        **os.environ,
        "SUBMISSIONS_DATABASE_URL": test_database,
        "SUBMISSIONS_SECRET": secret,
        "SUBMISSIONS_BIND": f"127.0.0.1:{port}",
        "SUBMISSIONS_API_URL": f"http://127.0.0.1:{callback.server_port}/process",
        "SUBMISSIONS_CONCURRENCY": "2",
        "SUBMISSIONS_MAX_ATTEMPTS": "6",
        "SUBMISSIONS_CLEANUP_ENABLED": "false",
    }
    worker = None
    created = False

    def request(path, payload=None, authenticated=True):
        headers = {"Content-Type": "application/json"}
        if authenticated:
            headers["X-Rocksky-Submissions-Secret"] = secret
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read()
                return response.status, json.loads(data) if data else None
        except urllib.error.HTTPError as error:
            return error.code, None

    def start(log):
        process = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=log)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"test worker exited with code {process.returncode}")
            try:
                if request("/v1/jobs/nonexistent")[0] == 404:
                    return process
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.1)
        process.kill()
        process.wait()
        raise RuntimeError("test worker did not become ready")

    try:
        sql(f"CREATE SCHEMA {schema}")
        created = True
        with tempfile.TemporaryFile(mode="w+") as log:
            worker = start(log)
            assert request("/v1/jobs/nonexistent", authenticated=False)[0] == 401
            assert request("/v1/submissions", {})[0] == 400
            track = {"title": "Durability test", "artist": "Test fixture", "album": "Test fixture", "albumArtist": "Test fixture", "duration": 180000}
            submission = {"did": "did:plc:durability-test-fixture", "idempotencyKey": "smoke-retry", "track": track}
            code, accepted = request("/v1/submissions", submission)
            assert code == 202
            job_id = accepted["id"]
            assert re.fullmatch(r"[a-f0-9]{64}", job_id)
            assert request("/v1/submissions", submission)[1]["id"] == job_id
            changed = copy.deepcopy(submission)
            changed["track"]["title"] = "different submission"
            assert request("/v1/submissions", changed)[0] == 409
            assert first_call.wait(15), "callback never received the first attempt"
            assert request(f"/v1/jobs/{job_id}")[1]["status"] == "processing"

            worker.kill()
            worker.wait(timeout=10)
            release_first.set()
            # Accelerate only this TEST lease instead of waiting two minutes.
            sql(f"UPDATE {schema}.rocksky_durable_jobs SET lease_until=0 WHERE id='{job_id}'")
            worker = start(log)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                state = request(f"/v1/jobs/{job_id}")[1]
                if state["status"] == "completed":
                    break
                time.sleep(0.2)
            assert state["status"] == "completed", state
            assert state["attempts"] == 3, state
            assert len(calls) == 3
            assert len({call["recordKey"] for call in calls}) == 1
            assert len({call["track"]["timestamp"] for call in calls}) == 1
            assert sql(f"SELECT count(*) FROM {schema}.rocksky_durable_steps WHERE job_id='{job_id}'") == "1"

            worker.terminate()
            # Actix allows up to 30 seconds to drain HTTP connections.
            worker.wait(timeout=45)
            # Exercise the service's real scheduled cleanup, not just queue SQL.
            env.update({"SUBMISSIONS_CLEANUP_ENABLED": "true",
                        "SUBMISSIONS_COMPLETED_RETENTION_SECONDS": "10",
                        "SUBMISSIONS_DEDUP_RETENTION_SECONDS": "0",
                        "SUBMISSIONS_CLEANUP_INTERVAL_SECONDS": "1",
                        "SUBMISSIONS_CLEANUP_BATCH_SIZE": "1"})
            sql(f"UPDATE {schema}.rocksky_durable_jobs SET updated_at=extract(epoch from now())::bigint-20 WHERE id='{job_id}'")
            worker = start(log)
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if request(f"/v1/jobs/{job_id}")[1]["compacted_at"] > 0:
                    break
                time.sleep(0.2)
            else:
                raise AssertionError("automatic cleanup did not compact the completed job")
            assert sql(f"SELECT count(*) FROM {schema}.rocksky_durable_steps WHERE job_id='{job_id}'") == "0"
            assert request("/v1/submissions", submission)[1]["id"] == job_id
            assert request("/v1/submissions", changed)[0] == 409
            time.sleep(1.5)
            assert len(calls) == 3, "completed job was published again after restart"
            assert request(f"/v1/jobs/{job_id}")[1]["status"] == "completed"
            print(json.dumps({"result": "passed", "backend": "postgres", "http_attempts": 3, "checks": ["authenticated intake", "durable acceptance", "idempotency/conflict", "SIGKILL recovery", "503 retry", "stable record key and timestamp", "step checkpoint", "no republication after restart", "automatic cleanup preserves deduplication"]}))
    finally:
        release_first.set()
        if worker is not None and worker.poll() is None:
            worker.terminate()
            try:
                worker.wait(timeout=45)
            except subprocess.TimeoutExpired:
                worker.kill()
                worker.wait()
        callback.shutdown()
        callback.server_close()
        if created:
            sql(f"DROP SCHEMA {schema} CASCADE")


if __name__ == "__main__":
    main()
