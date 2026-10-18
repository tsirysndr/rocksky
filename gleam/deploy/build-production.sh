#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(dirname -- "$project_dir")"

# REST and XRPC share dependencies and compiler output. Hold the lock through
# installation and compilation when systemd starts both units together.
exec 9>/run/lock/rocksky-gleam-build.lock
flock 9

cd "$repo_dir"
bun install --frozen-lockfile
cd "$project_dir"
gleam build --target javascript
