#!/usr/bin/env bash
# Publish the Gleam SDK (rocksky) to Hex. Pure Gleam — no native build; it depends
# on the published rocksky_erl (publish that FIRST with publish-erlang.sh).
#
# gleam.toml's committed default is the Hex rocksky_erl version requirement, but
# if a dev left the local path dep active, Hex would reject it — so this pins the
# rocksky_erl line to the released version requirement (>= <vsn> and < <next>.0.0),
# publishes, then restores gleam.toml + manifest.toml (a trap restores on failure).
#
# Auth first: gleam hex authenticate (or export HEXPM_API_KEY=...).
# Usage: ./publish-gleam.sh [--dry-run]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
gleam_dir="$here/../gleam"
dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

command -v gleam >/dev/null 2>&1 || { echo "error: gleam not found — https://gleam.run" >&2; exit 1; }

ver="$(sed -n 's/.*{vsn, *"\([^"]*\)".*/\1/p' "$here/../erlang/src/rocksky_erl.app.src" | head -1)"
[ -n "$ver" ] || { echo "error: could not read rocksky_erl version from app.src" >&2; exit 1; }
next_major=$(( ${ver%%.*} + 1 ))
req=">= $ver and < $next_major.0.0"

echo "== rocksky (gleam) -> Hex =="
echo "rocksky_erl dep: $req (publish that package first if you haven't)"

toml="$gleam_dir/gleam.toml"
manifest="$gleam_dir/manifest.toml"
toml_bak="$(mktemp)"; manifest_bak="$(mktemp)"
cp "$toml" "$toml_bak"
[ -f "$manifest" ] && cp "$manifest" "$manifest_bak" || : > "$manifest_bak"
restore() {
  cp "$toml_bak" "$toml"
  if [ -s "$manifest_bak" ]; then cp "$manifest_bak" "$manifest"; else rm -f "$manifest"; fi
  rm -f "$toml_bak" "$manifest_bak"
  rm -rf "$gleam_dir/build"
}
trap restore EXIT

# Force the rocksky_erl dep to the Hex version requirement (handles an
# uncommented local path dep). Rewrites the active line and drops any commented one.
python3 - "$toml" "$req" <<'PY'
import re, sys
path, req = sys.argv[1], sys.argv[2]
src = open(path).read()
new, n = re.subn(r'^\s*#?\s*rocksky_erl\s*=.*$', f'rocksky_erl = "{req}"', src, count=1, flags=re.M)
if n < 1:
    sys.exit("could not find the rocksky_erl dependency line in gleam.toml")
# drop any remaining commented/duplicate rocksky_erl lines
new = re.sub(r'^\s*#\s*rocksky_erl\s*=.*$\n?', '', new, flags=re.M)
open(path, "w").write(new)
PY
echo "rewrote gleam.toml dep -> rocksky_erl = \"$req\""

cd "$gleam_dir"
if [ "$dry" -eq 1 ]; then
  echo "DRY RUN — gleam.toml rewritten (restored on exit); not publishing."
  grep '^rocksky_erl' "$toml"
else
  gleam publish --yes
fi
echo "Done."
