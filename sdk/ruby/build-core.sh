#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
pkg="$here/lib/rocksky/core"
case "$(uname -s)" in
  Darwin) lib=librocksky_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=rocksky_uniffi.dll ;;
  *) lib=librocksky_uniffi.so ;;
esac
cargo build --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml"
cp "$root/target/release/$lib" "$pkg/$lib"
echo "built rocksky ruby core → $pkg/$lib"
