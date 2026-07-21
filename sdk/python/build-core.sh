#!/usr/bin/env bash
# (Re)generate the native-core bindings for the `rocksky.core` subpackage from
# the shared Rust core (rocksky-uniffi). The generated module is committed; the
# native library is co-located next to it (gitignored) so UniFFI's default loader
# finds it. Run this after any change to the FFI surface.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/python
root="$here/../.."                    # repo root
pkg="$here/src/rocksky/core"

case "$(uname -s)" in
  Darwin) lib=librocksky_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=rocksky_uniffi.dll ;;
  *) lib=librocksky_uniffi.so ;;
esac

cargo build --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml"
cargo run -q --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml" --bin uniffi-bindgen -- \
  generate --library "$root/target/release/$lib" --language python --out-dir "$pkg"
cp "$root/target/release/$lib" "$pkg/$lib"
echo "built rocksky.core python binding → $pkg"
