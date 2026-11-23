#!/bin/sh
# curl -fsSL https://cli.rocksky.app | sh
set -eu

fail() { printf 'rocksky: %s\n' "$*" >&2; exit 1; }
version=${ROCKSKY_VERSION:-latest}
variant=${ROCKSKY_VARIANT:-typescript}
install_dir=${ROCKSKY_INSTALL_DIR:-"${HOME}/.local/bin"}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version|--variant|--bin-dir)
      [ "$#" -ge 2 ] || fail "$1 requires a value"
      case "$1" in
        --version) version=$2 ;;
        --variant) variant=$2 ;;
        --bin-dir) install_dir=$2 ;;
      esac
      shift 2 ;;
    --help|-h)
      printf '%s\n' 'Usage: install.sh [--version VERSION] [--variant typescript|purescript] [--bin-dir PATH]' 'Defaults: latest CLI release, TypeScript, ~/.local/bin'
      exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
case "$variant" in
  typescript) prefix=rocksky ;;
  purescript) prefix=rocksky-purescript ;;
  *) fail 'Variant must be typescript or purescript' ;;
esac
case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) fail 'Only Linux and macOS are supported' ;; esac
case "$(uname -m)" in x86_64|amd64) arch=x86_64 ;; arm64|aarch64) arch=aarch64 ;; *) fail 'Only x86_64 and aarch64 are supported' ;; esac
[ "$platform-$arch" != darwin-x86_64 ] || fail 'macOS Intel is not supported; macOS requires Apple Silicon (aarch64)'
command -v curl >/dev/null 2>&1 || fail 'curl is required'
if command -v sha256sum >/dev/null 2>&1; then checksum=sha256sum
elif command -v shasum >/dev/null 2>&1; then checksum=shasum
else fail 'sha256sum or shasum is required'; fi

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  printf '\033[38;2;243;166;208m'
fi
cat <<'ROCKSKY_LOGO'
    ____             __        __
   / __ \____  _____/ /_______/ /____  __
  / /_/ / __ \/ ___/ //_/ ___/ //_/ / / /
 / _, _/ /_/ / /__/ ,< (__  ) ,< / /_/ /
/_/ |_|\____/\___/_/|_/____/_/|_|\__, /
                                /____/
ROCKSKY_LOGO
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  printf '\033[0m'
fi
printf '\n'

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
fetch() {
  # Binary downloads enable curl's meter: percentage, size, speed and ETA.
  # Abort stalled connections instead of leaving the installer waiting forever.
  curl --fail --show-error --silent --location --retry 2 \
    --connect-timeout 15 --max-time 900 --speed-limit 1024 --speed-time 30 \
    --proto '=https' --tlsv1.2 "${3:---silent}" "$1" --output "$2"
}
repository=https://github.com/tsirysndr/rocksky
if [ "$version" = latest ]; then
  # This monorepo also releases other products. Select the newest stable CLI tag.
  fetch 'https://api.github.com/repos/tsirysndr/rocksky/releases?per_page=100' "$temporary/releases.json"
  version=$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\(rocksky-cli-v[0-9][0-9.]*\)".*/\1/p' "$temporary/releases.json" | head -n 1)
  [ -n "$version" ] || fail 'No CLI release found. Publish the CLI binaries workflow first, or pass --version.'
fi
case "$version" in rocksky-cli-v*) tag=$version ;; v*) tag=rocksky-cli-$version ;; *) tag=rocksky-cli-v$version ;; esac
case "$tag" in *[!A-Za-z0-9._-]*|rocksky-cli-v) fail 'Invalid version' ;; esac
asset=$prefix-$platform-$arch
printf 'Downloading %s (%s)…\n' "$asset" "$tag"
fetch_asset() {
  attempt=1
  while [ "$attempt" -le 5 ]; do
    # Releases become visible before their asset uploads finish. A fresh query
    # avoids reusing a cached 404 from that window on subsequent attempts.
    url="$repository/releases/download/$tag/$1?download=1&rocksky=$(date +%s)-$attempt"
    if fetch "$url" "$2" "${3:---silent}"; then return 0; fi
    [ "$attempt" -lt 5 ] || break
    printf 'Release asset not available yet; retrying…\n' >&2
    sleep 2
    attempt=$((attempt + 1))
  done
  fail "Could not download $1 from $tag"
}
fetch_asset "$asset" "$temporary/$asset" --no-silent
fetch_asset "$asset.sha256" "$temporary/checksum"
expected=$(awk 'NR==1 {print $1}' "$temporary/checksum")
[ "${#expected}" -eq 64 ] || fail 'Invalid SHA-256 checksum'
case "$expected" in *[!0-9a-fA-F]*) fail 'Invalid SHA-256 checksum' ;; esac
if [ "$checksum" = sha256sum ]; then actual=$(sha256sum "$temporary/$asset" | awk '{print $1}')
else actual=$(shasum -a 256 "$temporary/$asset" | awk '{print $1}'); fi
[ "$actual" = "$expected" ] || fail 'SHA-256 checksum mismatch; installation aborted'
mkdir -p "$install_dir"
# Stage on the destination filesystem so replacement is atomic.
staged=$(mktemp "$install_dir/.rocksky-install.XXXXXX")
trap 'rm -rf "$temporary"; rm -f "$staged"' EXIT HUP INT TERM
cp "$temporary/$asset" "$staged"
chmod 755 "$staged"
mv -f "$staged" "$install_dir/rocksky"
printf 'Installed Rocksky %s (%s) to %s/rocksky\n' "$tag" "$variant" "$install_dir"
case ":${PATH}:" in *":$install_dir:"*) ;; *) printf 'Add %s to your PATH to run rocksky.\n' "$install_dir" ;; esac
