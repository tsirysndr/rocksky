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

# python package `rocksky`: UniFFI module under src/rocksky/. The wheel ships no
# native lib — it is downloaded on first import — so the generated loader is
# repatched to call `_native.resolve()` instead of looking for a bundled lib.
gen python "$sdk/python/src/rocksky"
python3 - "$sdk/python/src/rocksky/rocksky_uniffi.py" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
old = "    path = os.path.join(os.path.dirname(__file__), libname)\n"
new = ("    from . import _native as _rocksky_native  # rocksky: download-on-load\n"
       "    path = _rocksky_native.resolve()\n")
if old not in s:
    sys.exit("ABORT: python loader line not found — uniffi output changed, update the patch")
open(p, "w").write(s.replace(old, new, 1))
print("  patched python loader -> _native.resolve()")
PY

# kotlin package `rocksky`: UniFFI module under rocksky/src/main/kotlin/. The
# published jar bundles the native lib, so the default JNA loader is kept as-is.
gen kotlin "$sdk/kotlin/rocksky/src/main/kotlin"

echo "done. ruby/clojure use the capi C ABI (lib only); erlang/elixir/gleam use"
echo "the NIF — run ./build-native.sh and each package's ./build-core.sh."
