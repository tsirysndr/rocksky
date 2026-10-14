#!/usr/bin/env bash
# Run the full matching regression suite; optionally smoke-check a live service.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: bash crates/matching/scripts/validate.sh [--service-url URL]

Runs every rocksky-matching test in release mode with the checked-in lockfile.
Tests use temporary SQLite databases and local mock providers; no production
credentials or Doppler session are needed. Cargo may download dependencies.

Optional:
  --service-url URL  Also check /health and HTTP input validation on this service.
  -h, --help         Show this help.

Environment:
  MATCHING_TEST_JOBS  Cargo build parallelism (default: 2).
  CARGO              Cargo executable (default: cargo or ~/.cargo/bin/cargo).

Example:
  bash crates/matching/scripts/validate.sh --service-url http://127.0.0.1:8097
USAGE
}

service_url=''
while (($#)); do
  case "$1" in
    --service-url)
      if (($# < 2)) || [[ -z "$2" ]]; then
        usage >&2
        exit 2
      fi
      service_url="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../../.." && pwd)"
cd -- "$repo_root"

cargo_bin="${CARGO:-cargo}"
if ! command -v "$cargo_bin" >/dev/null 2>&1; then
  if [[ -z "${CARGO:-}" && -x "${HOME}/.cargo/bin/cargo" ]]; then
    cargo_bin="${HOME}/.cargo/bin/cargo"
  else
    printf 'Cargo is required; install Rust or set CARGO to its executable path.\n' >&2
    exit 1
  fi
fi
jobs="${MATCHING_TEST_JOBS:-2}"
if [[ ! "$jobs" =~ ^[1-9][0-9]*$ ]]; then
  printf 'MATCHING_TEST_JOBS must be a positive integer.\n' >&2
  exit 2
fi
if [[ -n "$service_url" ]]; then
  command -v python3 >/dev/null || { printf 'python3 is required for the live checks.\n' >&2; exit 1; }
  case "$service_url" in
    http://*|https://*) ;;
    *) printf 'The service URL must use http:// or https://.\n' >&2; exit 2 ;;
  esac
fi

printf 'Running the full matching suite in release mode (%s build jobs).\n' "$jobs"
"$cargo_bin" test --release --locked -p rocksky-matching --jobs "$jobs"

if [[ -n "$service_url" ]]; then
  python3 - "$service_url" <<'PY'
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip('/')

def call(path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()

status, body = call('/health')
if status != 200 or json.loads(body) != {'status': 'ok'}:
    raise SystemExit('FAIL: /health did not return the expected matching service response')

# Invalid inputs must fail before contacting any catalog or provider.
cases = [
    ('missing artist', {'title': 'Beat It'}),
    ('blank title', {'title': ' ', 'artists': ['Michael Jackson']}),
    ('empty artist list', {'title': 'Beat It', 'artists': []}),
    ('blank supplied album', {'title': 'Beat It', 'artists': ['Michael Jackson'], 'album': ' '}),
    ('misspelled album field', {'title': 'Beat It', 'artists': ['Michael Jackson'], 'albm': 'Thriller'}),
]
for name, payload in cases:
    status, _ = call('/v1/match', payload)
    if status != 400:
        raise SystemExit(f'FAIL: {name}: expected HTTP 400, got {status}')
print('PASS: live health and all five input-validation checks')
PY
fi
printf 'PASS: all matching validation checks completed.\n'
