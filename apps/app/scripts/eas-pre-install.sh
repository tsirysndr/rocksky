#!/usr/bin/env bash
set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-android}" != "android" ]]; then exit 0; fi
rust_version=1.98.0
cargo_ndk_version=4.1.2
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  installer="$(mktemp)"
  trap 'rm -f "$installer"' EXIT
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$installer"
  sh "$installer" -y --profile minimal --default-toolchain none --no-modify-path
fi
rustup toolchain install "$rust_version" --profile minimal \
  --target aarch64-linux-android --target x86_64-linux-android
if ! cargo +"$rust_version" ndk --version 2>/dev/null | grep -q "cargo-ndk $cargo_ndk_version$"; then
  cargo +"$rust_version" install cargo-ndk --version "$cargo_ndk_version" --locked --force
fi
rustc +"$rust_version" --version
cargo +"$rust_version" ndk --version
