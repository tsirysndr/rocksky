#!/usr/bin/env bash
# (Re)generate the :core native bindings from the shared Rust core
# (rocksky-uniffi) and stage the native library where JNA can load it.
#
# The generated Kotlin (uniffi/rocksky_uniffi/rocksky_uniffi.kt) is committed;
# the native lib is a build artifact — bundled under the JNA resource prefix
# (<os>-<arch>) so it's found on the classpath, and also copied to
# target/release (see mise JNA_LIBRARY_PATH) for `gradle run`/tests.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/kotlin
root="$here/../.."                    # repo root
pkg="$here/core/src/main/kotlin/uniffi/rocksky_uniffi"
res="$here/core/src/main/resources"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  lib=librocksky_uniffi.dylib; prefix=darwin-aarch64 ;;
  Darwin-x86_64) lib=librocksky_uniffi.dylib; prefix=darwin-x86-64 ;;
  Linux-aarch64) lib=librocksky_uniffi.so;    prefix=linux-aarch64 ;;
  Linux-x86_64)  lib=librocksky_uniffi.so;    prefix=linux-x86-64 ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

cargo build --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml"
cargo run -q --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml" --bin uniffi-bindgen -- \
  generate --library "$root/target/release/$lib" --language kotlin --out-dir "$here/core/src/main/kotlin"

mkdir -p "$res/$prefix"
cp "$root/target/release/$lib" "$res/$prefix/$lib"
echo "built rocksky kotlin :core → $pkg + $res/$prefix/$lib"
