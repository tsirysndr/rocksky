#!/usr/bin/env bash
set -euo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}/ndk/27.1.12297006}"

if ! command -v cargo >/dev/null 2>&1 || ! command -v cargo-ndk >/dev/null 2>&1; then
  echo 'Rust and cargo-ndk are required. Run bash scripts/eas-pre-install.sh first.' >&2
  exit 1
fi
if [[ ! -f "$ANDROID_NDK_HOME/source.properties" ]]; then
  echo "Android NDK missing at $ANDROID_NDK_HOME. Set ANDROID_NDK_HOME to NDK 27.1.12297006." >&2
  exit 1
fi
cd "$app_dir/native/engine"
cargo ndk -t arm64-v8a -t x86_64 -o "$app_dir/modules/rocksky-engine/android/src/main/jniLibs" \
  build --release --locked
node "$app_dir/scripts/verify-android-engine.cjs"
