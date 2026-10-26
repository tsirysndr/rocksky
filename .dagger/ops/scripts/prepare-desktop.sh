#!/usr/bin/env bash
set -euo pipefail
TAG="$RELEASE_TAG"
gh release view "$TAG" >/dev/null 2>&1 && exit 0
cat > notes.md <<'EOF'
Rocksky desktop player.

## macOS

```sh
brew install --cask tsirysndr/tap/rocksky
```

The app is **ad-hoc signed and not notarized** (no Apple Developer
account yet), so the first launch is blocked. Open it once, then go to
**System Settings → Privacy & Security** and click **Open Anyway** next
to the Rocksky message. Or clear the quarantine flag yourself:

```sh
xattr -dr com.apple.quarantine /Applications/Rocksky.app
```

## Linux

Grab the `.deb`, `.rpm`, or `.AppImage` below.

Managed by `.github/workflows/desktop-release.yml`.
EOF
gh release create "$TAG" \
  --title "Rocksky Desktop ${TAG#desktop-v}" \
  --notes-file notes.md \
  --target "$GITHUB_SHA"
