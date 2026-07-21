#!/usr/bin/env bash
# Publish the Kotlin SDK's :core module to Maven Central. Runs LOCALLY after
# bindings-release.yml has built + uploaded the per-triple uniffi libraries to
# the bindings-v<vsn> GitHub release.
#
# Unlike the other SDKs, the Kotlin jar BUNDLES every platform's native lib under
# the JNA resource prefixes (JNA loads from the classpath). This downloads the
# release libs, stages them, then runs the vanniktech publish (:core).
#
# Auth first (Maven Central Portal + signing):
#   ORG_GRADLE_PROJECT_mavenCentralUsername / ...Password
#   ORG_GRADLE_PROJECT_signingInMemoryKey / ...Password
#
# Usage: ./publish-kotlin.sh <tag> [dir-of-libs]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
kt="$here/../kotlin"
tag="${1:?usage: publish-kotlin.sh <tag> [dir-of-libs]}"
dir="${2:-}"

if [ -z "$dir" ]; then
  dir="$(mktemp -d)"
  echo "downloading $tag uniffi libs -> $dir"
  gh release download "$tag" --dir "$dir" --pattern 'librocksky_uniffi-*'
fi

res="$kt/core/src/main/resources"
rm -rf "$res"/darwin-* "$res"/linux-*
stage() { # <rust-triple> <ext> <jna-prefix>
  local src="$dir/librocksky_uniffi-$1.$2"
  [ -f "$src" ] || { echo "  (skip $1 — not in release)"; return; }
  mkdir -p "$res/$3"
  cp "$src" "$res/$3/librocksky_uniffi.$2"
  echo "  staged $1 -> $3/librocksky_uniffi.$2"
}
stage aarch64-apple-darwin dylib darwin-aarch64
stage x86_64-apple-darwin  dylib darwin-x86-64
stage aarch64-linux-gnu    so    linux-aarch64
stage x86_64-linux-gnu     so    linux-x86-64

cd "$kt"
echo "publishing :core to Maven Central (via mise JDK)..."
mise exec -- ./gradlew :core:publishAndReleaseToMavenCentral --no-configuration-cache
echo "Done."
