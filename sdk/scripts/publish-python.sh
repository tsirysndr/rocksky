#!/usr/bin/env bash
# Publish the Python SDK to PyPI. Runs LOCALLY (PyPI auth is interactive) after
# bindings-release.yml has built + uploaded the per-triple uniffi libraries to
# the bindings-v<vsn> GitHub release.
#
# The wheel is pure-Python (no bundled native lib): this fills manifest.json from
# the release artifacts, builds a single py3-none-any wheel + sdist, and uploads
# them. The native lib is fetched on first import (see src/rocksky/_native.py).
#
# Auth first: ~/.pypirc, or export TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-xxx
#
# Usage: ./publish-python.sh <tag> [dir-of-libs]
set -euo pipefail

# Publishing is LOCAL-ONLY — never publish from CI (bindings-release.yml only
# builds + uploads native libs to a GitHub release; it must not push packages).
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "refusing to publish from CI — run this locally" >&2; exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
py="$here/../python"
manifest="$py/src/rocksky/manifest.json"
tag="${1:?usage: publish-python.sh <tag> [dir-of-libs]}"
dir="${2:-}"

command -v uv >/dev/null 2>&1 || { echo "error: uv not found (https://docs.astral.sh/uv/)" >&2; exit 1; }
command -v twine >/dev/null 2>&1 || { echo "error: twine not found (uv tool install twine)" >&2; exit 1; }

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

# Fill the shipped manifest.json (checksums per triple) from the release libs.
"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

# GUARD: never publish a wheel whose native-lib download would fail. The manifest
# that will be packaged (src/rocksky/manifest.json — the path the wheel ships and
# _native.py reads) MUST have non-empty checksums and match the release tag. This
# catches a stale gen path, a release with no libs, or an unfilled placeholder.
python3 - "$manifest" "$tag" <<'PY'
import json, sys
path, tag = sys.argv[1], sys.argv[2]
try:
    m = json.load(open(path))
except Exception as e:
    sys.exit(f"ABORT: manifest {path} unreadable: {e}")
checksums = m.get("checksums") or {}
if not checksums:
    sys.exit(
        f"ABORT: {path} has empty checksums — publishing this would ship a wheel "
        f"that cannot download its native library. Ensure the '{tag}' GitHub "
        f"release has librocksky_uniffi-<triple>.* assets and that "
        f"gen-uniffi-manifest.sh wrote to this exact path."
    )
if m.get("tag") != tag:
    sys.exit(f"ABORT: manifest tag {m.get('tag')!r} != release tag {tag!r}")
print(f"manifest OK: {len(checksums)} triple(s) — {', '.join(sorted(checksums))}")
PY

cd "$py"
rm -rf dist
# A gitignored local dev build in the package dir would leak into the wheel.
rm -f src/rocksky/*.so src/rocksky/*.dylib src/rocksky/*.dll
uv build

# GUARD: verify the built wheel actually contains the filled manifest (belt and
# suspenders against a build that excludes it or ships a stale copy).
whl="$(ls -1 dist/*.whl | head -1)"
python3 - "$whl" <<'PY'
import json, sys, zipfile
whl = sys.argv[1]
with zipfile.ZipFile(whl) as z:
    names = [n for n in z.namelist() if n.endswith("rocksky/manifest.json")]
    if not names:
        sys.exit(f"ABORT: {whl} does not contain rocksky/manifest.json")
    m = json.loads(z.read(names[0]))
    if not (m.get("checksums") or {}):
        sys.exit(f"ABORT: {whl} ships a manifest with empty checksums")
print(f"wheel {whl} ships a valid manifest")
PY

echo "built:"; ls -1 dist
echo "uploading to PyPI..."
twine upload --skip-existing dist/*
echo "Done."
