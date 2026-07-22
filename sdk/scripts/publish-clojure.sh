#!/usr/bin/env bash
# Publish the Clojure SDK to Clojars. Runs LOCALLY after bindings-release.yml has
# built + uploaded the per-triple uniffi libraries to the bindings-v<vsn> release.
#
# The jar ships no native lib: this fills resources/rocksky/manifest.json from the
# release artifacts, then builds + deploys the jar. The native lib is fetched on
# first load (see src/rocksky/native.clj).
#
# Auth first: export CLOJARS_USERNAME=<user> CLOJARS_PASSWORD=<clojars-deploy-token>
# Usage: ./publish-clojure.sh <tag> [dir-of-libs]
set -euo pipefail

# Publishing is LOCAL-ONLY — never publish from CI (bindings-release.yml only
# builds + uploads native libs to a GitHub release; it must not push packages).
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "refusing to publish from CI — run this locally" >&2; exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
clj="$here/../clojure"
tag="${1:?usage: publish-clojure.sh <tag> [dir-of-libs]}"
dir="${2:-}"

command -v clojure >/dev/null 2>&1 || { echo "error: clojure CLI not found" >&2; exit 1; }

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

cd "$clj"
# A local dev lib under resources/ must not be bundled with a stale checksum.
rm -f resources/*.so resources/*.dylib resources/*.dll
echo "deploying to Clojars..."
clojure -T:build deploy
echo "Done."
