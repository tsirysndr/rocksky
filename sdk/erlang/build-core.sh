#!/usr/bin/env bash
# Build the native NIF from the shared Rust core and stage it at
# priv/rocksky_nif.so (loaded as .so on every Unix, including macOS).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)" # sdk/erlang
root="$here/../.."                    # repo root
mkdir -p "$here/priv"

case "$(uname -s)" in
  Darwin) nifsrc=librocksky_nif.dylib ;;
  MINGW* | MSYS* | CYGWIN*) nifsrc=rocksky_nif.dll ;;
  *) nifsrc=librocksky_nif.so ;;
esac

cargo build --release -p rocksky-nif --manifest-path "$root/Cargo.toml"
cp "$root/target/release/$nifsrc" "$here/priv/rocksky_nif.so"
echo "built rocksky erlang NIF → $here/priv/rocksky_nif.so"
