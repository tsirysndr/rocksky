#!/usr/bin/env bash
# (Re)generate the native-core bindings for the top-level `rocksky` package from
# the shared Rust core (rocksky-uniffi), and patch the UniFFI loader for
# download-on-load.
#
# The generated module is COMMITTED so the published wheel is pure-Python and
# needs no Rust to install — its native library is fetched from the GitHub
# release on first import (see _native.py), or a local dev build in the package
# dir is preferred. Run after any change to the FFI surface.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/python
root="$here/../.."                    # repo root
pkg="$here/src/rocksky"

case "$(uname -s)" in
  Darwin) lib=librocksky_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=rocksky_uniffi.dll ;;
  *) lib=librocksky_uniffi.so ;;
esac

cargo build --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml"
cargo run -q --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml" --bin uniffi-bindgen -- \
  generate --library "$root/target/release/$lib" --language python --out-dir "$pkg"

# Patch the generated loader: resolve the library path via _native (local dev
# build, else a checksum-verified download from the release) instead of the
# fixed package-dir path UniFFI emits.
python3 - "$pkg/rocksky_uniffi.py" <<'PY'
import sys
p = sys.argv[1]
src = open(p).read()
old = "    path = os.path.join(os.path.dirname(__file__), libname)"
new = "    from . import _native as _rocksky_native  # rocksky: download-on-load\n    path = _rocksky_native.resolve()"
if old not in src and "_rocksky_native" not in src:
    raise SystemExit("could not find the UniFFI loader line to patch")
if old in src:
    src = src.replace(old, new, 1)
    open(p, "w").write(src)
    print("patched rocksky_uniffi.py loader -> _native.resolve()")
else:
    print("rocksky_uniffi.py loader already patched")
PY

# A local dev build in the package dir is preferred by _native.resolve()
# (gitignored). The published wheel ships neither this nor the module regen.
cp "$root/target/release/$lib" "$pkg/$lib"
echo "built rocksky python binding -> $pkg (patched module + $lib)"
