#!/usr/bin/env bash
# Build the native binding libraries (release) and stage them with an optional
# target-triple suffix for release upload. Both are cdylibs from the Cargo
# workspace and back the language SDKs:
#   - librocksky_uniffi.<ext>  → Python (UniFFI), Ruby (fiddle), Clojure (Panama)
#   - rocksky_nif.so           → Erlang/Elixir/Gleam (Rustler NIF; loaded as .so)
#
# Usage:
#   ./build-native.sh                      # host build, unsuffixed → dist/
#   ./build-native.sh x86_64-linux-gnu     # suffixed name for a release asset
#   OUT=/tmp/x ./build-native.sh <triple>  # custom output dir
#   FEATURES=dedup,jetstream ./build-native.sh   # extra cargo features
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/scripts
root="$here/../.."                    # repo root
target="${1:-}"
out="${OUT:-$here/dist}"
mkdir -p "$out"

feat_args=()
[ -n "${FEATURES:-}" ] && feat_args=(--features "$FEATURES")

cargo build --release --manifest-path "$root/Cargo.toml" \
  -p rocksky-uniffi -p rocksky-nif "${feat_args[@]}"

case "$(uname -s)" in
  Darwin) uext=dylib; nifsrc=librocksky_nif.dylib ;;
  MINGW* | MSYS* | CYGWIN*) uext=dll; nifsrc=rocksky_nif.dll ;;
  *) uext=so; nifsrc=librocksky_nif.so ;;
esac
sfx=""
[ -n "$target" ] && sfx="-$target"

cp "$root/target/release/librocksky_uniffi.$uext" "$out/librocksky_uniffi$sfx.$uext"
# The Erlang NIF is loaded as .so on every Unix (including macOS).
cp "$root/target/release/$nifsrc" "$out/rocksky_nif$sfx.so"

echo "staged native libs in $out:"
ls -1 "$out"
