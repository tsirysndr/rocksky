#!/usr/bin/env bash
# Build the native Rocksky core (librocksky_uniffi) and drop it on the Clojure
# classpath (resources/) so rocksky.native resolves it. The library is a build
# artifact (gitignored) — run after checkout / on any Rust change. rocksky.ffi
# binds its C ABI via the JVM Panama FFM API (JDK 22+).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/clojure
root="$here/../.."                    # repo root

case "$(uname -s)" in
  Darwin) lib=librocksky_uniffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=rocksky_uniffi.dll ;;
  *) lib=librocksky_uniffi.so ;;
esac

cargo build --release -p rocksky-uniffi --manifest-path "$root/Cargo.toml"
mkdir -p "$here/resources"
cp "$root/target/release/$lib" "$here/resources/$lib"
echo "built rocksky clojure native core → $here/resources/$lib"
