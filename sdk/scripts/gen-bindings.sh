#!/usr/bin/env bash
# Generate the UniFFI language bindings from the built native core and drop them
# into each SDK package (keeping the existing package names). Only Python and
# Kotlin consume UniFFI-generated code; the other SDKs bind the native lib
# directly:
#   - ruby / clojure : the plain C ABI (capi) — no codegen, just the lib
#   - erlang/elixir/gleam : the Rustler NIF (rocksky_nif.so) — built by build-native.sh
#
# Run ./build-native.sh first (produces target/release/librocksky_uniffi.<ext>).
# Each package also has its own ./build-core.sh that does gen + lib staging.
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

# python package `rocksky`: UniFFI module under src/rocksky/core/ (co-locate lib).
gen python "$sdk/python/src/rocksky/core"
cp "$lib" "$sdk/python/src/rocksky/core/"

# kotlin `:core` subproject: UniFFI module under core/src/main/kotlin/.
gen kotlin "$sdk/kotlin/core/src/main/kotlin"

echo "done. ruby/clojure use the capi C ABI (lib only); erlang/elixir/gleam use"
echo "the NIF — run ./build-native.sh and each package's ./build-core.sh."
