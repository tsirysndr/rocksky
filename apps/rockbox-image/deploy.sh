#!/usr/bin/env bash
# Build the per-user rockbox image (tsiry/rockbox + Go proxy) and push it to
# Fly's registry as `registry.fly.io/rockbox:latest`. The rockbox-router on
# Fly then references this image when it spawns a machine for a new DID.
#
# Usage:
#   ./deploy.sh                # builds + pushes
#   IMAGE_TAG=v2 ./deploy.sh   # custom tag instead of :latest
set -euo pipefail

APP="${FLY_APP:-rockbox}"
TAG="${IMAGE_TAG:-latest}"

echo "→ build & push registry.fly.io/${APP}:${TAG}"
fly deploy \
  --app "${APP}" \
  --build-only \
  --push \
  --image-label "${TAG}"

echo
echo "✓ pushed registry.fly.io/${APP}:${TAG}"
echo
echo "Next:"
echo "  1) Make sure ROCKBOX_IMAGE on rockbox-router points at this tag:"
echo "       fly secrets list -a rockbox-router    (or check fly.toml env)"
echo "  2) Recreate existing machines so they pick up the new image, e.g.:"
echo "       fly machine list -a ${APP}"
echo "       fly machine destroy --force <machine-id> -a ${APP}"
echo "     The router will re-provision on the next request."
