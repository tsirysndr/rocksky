#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(dirname -- "$project_dir")"

# REST and XRPC share native artifacts, dependencies and compiler output.
# Linux deployments use flock; macOS provides shlock with stale-PID recovery.
case "$(uname -s)" in
  Linux)
    native_library="librocksky_analysis_node.so"
    exec 9>/run/lock/rocksky-gleam-build.lock
    flock 9
    ;;
  Darwin)
    native_library="librocksky_analysis_node.dylib"
    mkdir -p "$repo_dir/target"
    build_lock="$repo_dir/target/rocksky-gleam-build.lock"
    command -v shlock >/dev/null || { echo "macOS build requires shlock." >&2; exit 1; }
    while ! shlock -p "$$" -f "$build_lock"; do sleep 1; done
    trap 'rm -f -- "$build_lock"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    ;;
  *) echo "Unsupported operating system: $(uname -s). Expected Linux or macOS." >&2; exit 1 ;;
esac

# The file: dependency must contain its native library before Bun installs it.
# Use an explicit target directory so CARGO_TARGET_DIR cannot change the copy path.
cargo build --manifest-path "$repo_dir/Cargo.toml" --locked --release \
  -p rocksky-analysis-node --target-dir "$repo_dir/target"
install -m 755 "$repo_dir/target/release/$native_library" \
  "$repo_dir/crates/analysis-node/index.node"

cd "$repo_dir"
bun install --frozen-lockfile
cd "$project_dir"
gleam build --target javascript
