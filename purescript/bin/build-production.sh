#!/usr/bin/env bash
set -euo pipefail

port_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd -- "$port_dir/.." && pwd)"

# The file: dependency must contain its native library before Bun installs it.
# Use an explicit target directory so CARGO_TARGET_DIR cannot change the copy path.
cargo build --manifest-path "$repo_dir/Cargo.toml" --locked --release \
  -p rocksky-analysis-node --target-dir "$repo_dir/target"
install -m 755 "$repo_dir/target/release/librocksky_analysis_node.so" \
  "$repo_dir/crates/analysis-node/index.node"

cd -- "$port_dir"
# Compiler, Spago and the process supervisor are devDependencies but are needed
# during deployment. Runtime is separately started with NODE_ENV=production.
NODE_ENV=development bun install --frozen-lockfile
bun run bundle
bun run check:bundles
