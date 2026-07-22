#!/usr/bin/env bash
# Regenerate the native-lib download manifest (manifest.json) for the Python,
# Ruby, and Clojure SDKs from the release artifacts (librocksky_uniffi-<triple>.<ext>).
# Those SDKs ship only this manifest (repo/tag + one sha256 per triple) and
# download the matching prebuilt on first load, verifying it against the sha256.
#
# Usage: ./gen-uniffi-manifest.sh <dir-of-libs> <tag>
#   REPO=owner/repo  (default tsirysndr/rocksky)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sdk="$here/.."
dir="${1:?usage: gen-uniffi-manifest.sh <dir-of-libs> <tag>}"
tag="${2:?tag required, e.g. bindings-v0.1.0}"
repo="${REPO:-tsirysndr/rocksky}"

python3 - "$dir" "$tag" "$repo" \
  "$sdk/python/src/rocksky/manifest.json" \
  "$sdk/ruby/lib/rocksky/manifest.json" \
  "$sdk/clojure/resources/rocksky/manifest.json" <<'PY'
import sys, os, glob, json, hashlib
d, tag, repo, *outs = sys.argv[1:]
checks = {}
for lib in sorted(glob.glob(os.path.join(d, "librocksky_uniffi-*"))):
    triple = os.path.basename(lib)[len("librocksky_uniffi-"):].rsplit(".", 1)[0]
    checks[triple] = hashlib.sha256(open(lib, "rb").read()).hexdigest()
if not checks:
    sys.exit(f"no librocksky_uniffi-* files in {d}")
manifest = {"repo": repo, "tag": tag, "checksums": checks}
for out in outs:
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print("wrote", out)
PY
