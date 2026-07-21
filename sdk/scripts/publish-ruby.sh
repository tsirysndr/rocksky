#!/usr/bin/env bash
# Publish the Ruby SDK to RubyGems. Runs LOCALLY after bindings-release.yml has
# built + uploaded the per-triple uniffi libraries to the bindings-v<vsn> release.
#
# The gem ships no native lib: this fills lib/rocksky/core/manifest.json from the
# release artifacts, builds a single gem, and `gem push`es it. The native lib is
# fetched on first load (see lib/rocksky/core/native.rb).
#
# Auth first: gem signin (or export GEM_HOST_API_KEY=rubygems_xxx)
#
# Usage: ./publish-ruby.sh <tag> [dir-of-libs]
set -euo pipefail

# Publishing is LOCAL-ONLY — never publish from CI (bindings-release.yml only
# builds + uploads native libs to a GitHub release; it must not push packages).
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "refusing to publish from CI — run this locally" >&2; exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"
rb="$here/../ruby"
tag="${1:?usage: publish-ruby.sh <tag> [dir-of-libs]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

cd "$rb"
rm -f lib/rocksky/core/*.so lib/rocksky/core/*.dylib lib/rocksky/core/*.dll
gem build rocksky.gemspec
gem_file="$(ls -t ./*.gem | head -1)"
echo "built $gem_file"
echo "pushing to RubyGems..."
gem push "$gem_file"
echo "Done."
