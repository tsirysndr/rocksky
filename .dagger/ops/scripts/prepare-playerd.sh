#!/usr/bin/env bash
set -euo pipefail
TAG="$RELEASE_TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "playerd ${TAG#playerd-}" \
    --notes "Rocksky remote player daemon. Managed by playerd-release.yml." \
    --target "$GITHUB_SHA"
fi
