#!/usr/bin/env bash
set -euo pipefail
TAG="$RELEASE_TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "Rocksky binding libraries ($TAG)" \
    --notes "Native binding libraries (librocksky_uniffi + rocksky_nif) for the Rocksky SDKs. Managed by bindings-release.yml." \
    --target "$GITHUB_SHA" --prerelease
fi
