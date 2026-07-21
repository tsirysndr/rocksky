#!/usr/bin/env bash
# Generate the UniFFI language bindings from the built native core and drop them
# into each SDK package (keeping the existing package names: python `rocksky`,
# ruby `rocksky`). The low-level generated module is placed alongside the
# hand-written package so the package's public API can re-export it.
#
# Run ./build-native.sh first (produces target/release/librocksky_uniffi.<ext>).
#
# Usage: ./gen-bindings.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/scripts
root="$here/../.."                    # repo root
sdk="$here/.."                        # sdk/

case "$(uname -s)" in
  Darwin) uext=dylib ;;
  MINGW* | MSYS* | CYGWIN*) uext=dll ;;
  *) uext=so ;;
esac
lib="$root/target/release/librocksky_uniffi.$uext"
[ -f "$lib" ] || { echo "missing $lib — run ./build-native.sh first" >&2; exit 1; }

gen() { # <language> <out-dir>
  local lang="$1" outdir="$2"
  mkdir -p "$outdir"
  cargo run --release --manifest-path "$root/Cargo.toml" \
    -p rocksky-uniffi --bin uniffi-bindgen -- \
    generate --library "$lib" --language "$lang" --out-dir "$outdir"
  echo "  generated $lang -> $outdir"
}

# python package `rocksky`: low-level module under src/rocksky/
gen python "$sdk/python/src/rocksky/_native"
# ruby gem `rocksky`: low-level module under lib/rocksky/
gen ruby "$sdk/ruby/lib/rocksky/_native"

echo "done. Wire each package's public API to re-export its _native module."
