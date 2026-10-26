#!/usr/bin/env bash
set -euo pipefail
export RELEASE_TARGET=x86_64-unknown-linux-gnu RELEASE_BUNDLES=deb,rpm,appimage
export RUNNER_OS=Linux RUNNER_TEMP=/tmp LIBGL_ALWAYS_SOFTWARE=1
cd /src
cd /src
# Install workspace dependencies
bun install --frozen-lockfile
cd /src/sdk/typescript
# Build @rocksky/sdk
bun run build
cd /src/desktop
# Stamp version from tag
jq --arg v "$VERSION" '.version = $v' src-tauri/tauri.conf.json > /tmp/conf.json
mv /tmp/conf.json src-tauri/tauri.conf.json
echo "bundle version: $(jq -r .version src-tauri/tauri.conf.json)"

cd /src/desktop
# Prepare portable AppImage launcher and libraries
bash scripts/prepare-appimage.sh "$RUNNER_TEMP/rocksky-appimage.json"
cd /src/desktop
# tauri build
set -euo pipefail
# `--mode prod` loads desktop/.env.prod; a non-empty repo secret
# overrides the KLIPY key committed there (real env wins in Vite).
if [ -n "${KLIPY_API_KEY:-}" ]; then
  export VITE_KLIPY_API_KEY="$KLIPY_API_KEY"
fi
extra_config=(--config '{"build":{"beforeBuildCommand":"bun run build:prod"}}')
if [ "$RUNNER_OS" = Linux ]; then
  extra_config+=(--config "$RUNNER_TEMP/rocksky-appimage.json")
fi
bun run tauri build \
  --target $RELEASE_TARGET \
  --bundles $RELEASE_BUNDLES \
  "${extra_config[@]}"

cd /src/desktop
# Verify AppImage permissions, dependencies, and startup
set -euo pipefail
images=(src-tauri/target/$RELEASE_TARGET/release/bundle/appimage/*.AppImage)
[ "${#images[@]}" -eq 1 ] && [ -f "${images[0]}" ]
image="$(realpath "${images[0]}")"
stage="$(mktemp -d)"
# The runtime's --appimage-extract creates directories with 0700,
# regardless of their stored mode. Inspect actual SquashFS modes.
offset="$("$image" --appimage-offset)"
[[ "$offset" =~ ^[0-9]+$ ]]
unsquashfs -no-progress -o "$offset" -d "$stage/squashfs-root" "$image" >/dev/null
python3 scripts/check-appimage.py "$stage/squashfs-root"
dbus-run-session -- xvfb-run -a \
  python3 scripts/smoke-appimage.py "$stage/squashfs-root/AppRun"

cd /src/desktop
# Collect Linux bundles
set -euo pipefail
BUNDLE="src-tauri/target/$RELEASE_TARGET/release/bundle"
cp "$BUNDLE"/deb/*.deb "Rocksky_${VERSION}_amd64.deb"
cp "$BUNDLE"/rpm/*.rpm "Rocksky_${VERSION}_x86_64.rpm"
cp "$BUNDLE"/appimage/*.AppImage "Rocksky_${VERSION}_amd64.AppImage"

cd /src/desktop
# Checksums
set -euo pipefail
for f in Rocksky_*; do
  case "$f" in *.sha256) continue;; esac
  shasum -a 256 "$f" > "$f.sha256"
done
ls -l Rocksky_*

mkdir -p /out
cp Rocksky_* /out/
