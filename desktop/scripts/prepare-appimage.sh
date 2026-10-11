#!/usr/bin/env bash
set -euo pipefail

config_path="${1:?Usage: prepare-appimage.sh /path/to/tauri-appimage.json}"

# Tauri 2.11.4 downloads this launcher with mode 0770. linuxdeploy renames it
# AppRun.wrapped and preserves the mode, so other users cannot launch the image.
# Seed the same verified launcher with permissions suitable for distribution.
tools_dir="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
mkdir -p "$tools_dir"
launcher="$tools_dir/AppRun-x86_64"
download="$(mktemp "$tools_dir/AppRun-download.XXXXXX")"
trap 'rm -f "$download"' EXIT
curl --fail --location --retry 3 \
  https://github.com/tauri-apps/binary-releases/releases/download/apprun-old/AppRun-x86_64 \
  --output "$download"
printf '%s  %s\n' f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f "$download" | sha256sum --check
chmod 0755 "$download"
mv -f "$download" "$launcher"

# linuxdeploy excludes these as assumed desktop-system libraries. Minimal
# installations do not necessarily have them, so explicitly ship our copies.
python3 - "$config_path" <<'PY'
import json
from pathlib import Path
import subprocess
import sys

cache = subprocess.check_output(["ldconfig", "-p"], text=True)
files = {}
for name in ("libfribidi.so.0", "libharfbuzz.so.0"):
    matches = [line.split("=>", 1)[1].strip() for line in cache.splitlines()
               if line.strip().startswith(name + " ") and "x86-64" in line]
    if not matches:
        raise SystemExit(f"Missing build dependency: {name}")
    files[f"/usr/lib/{name}"] = str(Path(matches[0]).resolve(strict=True))
Path(sys.argv[1]).write_text(json.dumps({"bundle": {"linux": {"appimage": {"files": files}}}}, indent=2) + "\n")
PY
