#!/usr/bin/env bash
# Native builds with the matching official DuckDB static release, cached in target/.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 scripts/cargo_static.py "$@"
