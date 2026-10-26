#!/usr/bin/env bash
set -euo pipefail
TAG="$RELEASE_TAG"
if ! gh release view "$TAG" >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "rocksky-mcp ${TAG#rocksky-mcp-}" \
    --notes "Model Context Protocol server for Rocksky. Managed by rocksky-mcp-release.yml." \
    --target "$GITHUB_SHA"
fi
