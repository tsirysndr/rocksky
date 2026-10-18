#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(dirname -- "$project_dir")"

# The file: dependency must contain its native library before Bun installs it.
# Use an explicit target directory so CARGO_TARGET_DIR cannot change the copy path.
cargo build --manifest-path "$repo_dir/Cargo.toml" --locked --release \
  -p rocksky-analysis-node --target-dir "$repo_dir/target"
install -m 755 "$repo_dir/target/release/librocksky_analysis_node.so" \
  "$repo_dir/crates/analysis-node/index.node"

# REST and XRPC share dependencies and compiler output. Hold the lock through
# installation and compilation when systemd starts both units together.
exec 9>/run/lock/rocksky-gleam-build.lock
flock 9

cd "$repo_dir"
bun install --frozen-lockfile
cd "$project_dir"
gleam build --target javascript
