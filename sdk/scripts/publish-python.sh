#!/usr/bin/env bash
# Publish the Python SDK to PyPI. Runs LOCALLY (PyPI auth is interactive) after
# bindings-release.yml has built + uploaded the per-triple uniffi libraries to
# the bindings-v<vsn> GitHub release.
#
# The wheel is pure-Python (no bundled native lib): this fills manifest.json from
# the release artifacts, builds a single py3-none-any wheel + sdist, and uploads
# them. The native lib is fetched on first import (see src/rocksky/core/_native.py).
#
# Auth first: ~/.pypirc, or export TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-xxx
#
# Usage: ./publish-python.sh <tag> [dir-of-libs]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py="$here/../python"
tag="${1:?usage: publish-python.sh <tag> [dir-of-libs]}"
dir="${2:-}"

command -v uv >/dev/null 2>&1 || { echo "error: uv not found (https://docs.astral.sh/uv/)" >&2; exit 1; }
command -v twine >/dev/null 2>&1 || { echo "error: twine not found (uv tool install twine)" >&2; exit 1; }

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

cd "$py"
rm -rf dist
# A gitignored local dev build in the package dir would leak into the wheel.
rm -f src/rocksky/core/*.so src/rocksky/core/*.dylib src/rocksky/core/*.dll
uv build
echo "built:"; ls -1 dist
echo "uploading to PyPI..."
twine upload --skip-existing dist/*
echo "Done."
