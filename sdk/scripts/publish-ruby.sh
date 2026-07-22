#!/usr/bin/env bash
# Publish the Ruby SDK to RubyGems. Runs LOCALLY after bindings-release.yml has
# built + uploaded the per-triple uniffi libraries to the bindings-v<vsn> release.
#
# The gem ships no native lib: this fills lib/rocksky/manifest.json from the
# release artifacts, builds a single gem, and `gem push`es it. The native lib is
# fetched on first load (see lib/rocksky/native.rb).
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
manifest="$rb/lib/rocksky/manifest.json"
tag="${1:?usage: publish-ruby.sh <tag> [dir-of-libs]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

"$here/gen-uniffi-manifest.sh" "$dir" "$tag"

# GUARD: never publish a gem whose native-lib download would fail. The manifest
# the gem ships (lib/rocksky/manifest.json — the path native.rb reads) MUST have
# non-empty checksums and match the release tag.
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
        f"ABORT: {path} has empty checksums — publishing this would ship a gem "
        f"that cannot download its native library. Ensure the '{tag}' GitHub "
        f"release has librocksky_uniffi-<triple>.* assets and that "
        f"gen-uniffi-manifest.sh wrote to this exact path."
    )
if m.get("tag") != tag:
    sys.exit(f"ABORT: manifest tag {m.get('tag')!r} != release tag {tag!r}")
print(f"manifest OK: {len(checksums)} triple(s) — {', '.join(sorted(checksums))}")
PY

cd "$rb"
rm -f lib/rocksky/*.so lib/rocksky/*.dylib lib/rocksky/*.dll
gem build rocksky.gemspec
gem_file="$(ls -t ./*.gem | head -1)"
echo "built $gem_file"
echo "pushing to RubyGems..."
gem push "$gem_file"
echo "Done."
