#!/usr/bin/env bash
# Publish the Erlang SDK (rocksky_erl) to Hex. Runs LOCALLY (Hex auth is
# interactive) after bindings-release.yml has built + uploaded the per-triple
# NIF artifacts to the erlang-v<vsn> GitHub release.
#
# It writes priv/rocksky_nif.manifest from the release artifacts, then runs
# `rebar3 hex publish` (which excludes the .so and ships only the manifest).
#
# Usage: ./publish-erlang.sh <tag> [dir-of-so]
set -euo pipefail

# Publishing is LOCAL-ONLY — never publish from CI (bindings-release.yml only
# builds + uploads native libs to a GitHub release; it must not push packages).
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "refusing to publish from CI — run this locally" >&2; exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
tag="${1:?usage: publish-erlang.sh <tag> [dir-of-so]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag NIF artifacts -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'rocksky_nif-*.so'
fi

"$here/gen-nif-manifest.sh" "$dir" "$tag"

cd "$here/../erlang"
echo "publishing to Hex (interactive)..."
rebar3 hex publish
