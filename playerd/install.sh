#!/bin/sh
# Install playerd — the Rocksky remote player daemon — from a GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/tsirysndr/rocksky/main/playerd/install.sh | sh
#
# Environment:
#   PLAYERD_VERSION      Version to install: "0.2.0", "v0.2.0" or the full tag
#                        "playerd-v0.2.0". Default: the newest playerd release.
#   PLAYERD_INSTALL_DIR  Where the binary goes. Default: /usr/local/bin when
#                        writable, else ~/.local/bin.
#
# Release assets are produced by .github/workflows/playerd-release.yml as
# playerd-v<version>-<target>.tar.gz (+ .sha256), for:
#   aarch64-apple-darwin, x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu

set -eu

REPO="tsirysndr/rocksky"

say() { printf '%s\n' "$*"; }
fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

# ── OS + architecture → release target ──────────────────────────────────────
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin)
    case "$arch" in
      arm64 | aarch64) target="aarch64-apple-darwin" ;;
      x86_64) fail "no macOS Intel build is published — build from source: cargo install --git https://github.com/$REPO playerd" ;;
      *) fail "unsupported macOS architecture: $arch" ;;
    esac
    ;;
  Linux)
    case "$arch" in
      x86_64 | amd64) target="x86_64-unknown-linux-gnu" ;;
      aarch64 | arm64) target="aarch64-unknown-linux-gnu" ;;
      *) fail "unsupported Linux architecture: $arch" ;;
    esac
    ;;
  *)
    fail "unsupported OS: $os (playerd releases cover macOS arm64 and Linux x86_64/aarch64)"
    ;;
esac

# ── Resolve the release tag ─────────────────────────────────────────────────
# The repo's releases mix several kinds (bindings-v*, playerd-v*…), so
# /releases/latest is unreliable — pick the newest playerd-v* tag explicitly.
if [ -n "${PLAYERD_VERSION:-}" ]; then
  case "$PLAYERD_VERSION" in
    playerd-v*) tag="$PLAYERD_VERSION" ;;
    v*) tag="playerd-$PLAYERD_VERSION" ;;
    *) tag="playerd-v$PLAYERD_VERSION" ;;
  esac
else
  tag="$(
    curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=100" |
      grep -o '"tag_name": *"playerd-v[^"]*"' |
      head -1 |
      sed 's/.*"\(playerd-v[^"]*\)"/\1/'
  )"
  [ -n "$tag" ] || fail "could not find a playerd release on github.com/$REPO"
fi

asset="playerd-${tag#playerd-}-$target.tar.gz"
base="https://github.com/$REPO/releases/download/$tag"
say "installing playerd ${tag#playerd-} for $target"

# ── Download + verify ───────────────────────────────────────────────────────
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fSL --progress-bar -o "$tmp/$asset" "$base/$asset" ||
  fail "download failed: $base/$asset (does $tag ship a $target build?)"

if curl -fsSL -o "$tmp/$asset.sha256" "$base/$asset.sha256" 2>/dev/null; then
  if command -v shasum >/dev/null 2>&1; then
    (cd "$tmp" && shasum -a 256 -c "$asset.sha256" >/dev/null) || fail "checksum mismatch for $asset"
  elif command -v sha256sum >/dev/null 2>&1; then
    (cd "$tmp" && sha256sum -c "$asset.sha256" >/dev/null) || fail "checksum mismatch for $asset"
  else
    say "warning: no shasum/sha256sum found — skipping checksum verification"
  fi
else
  say "warning: no checksum published for $asset — skipping verification"
fi

tar -xzf "$tmp/$asset" -C "$tmp" playerd

# ── Install ─────────────────────────────────────────────────────────────────
if [ -n "${PLAYERD_INSTALL_DIR:-}" ]; then
  dir="$PLAYERD_INSTALL_DIR"
  mkdir -p "$dir"
elif [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
  dir="/usr/local/bin"
else
  dir="$HOME/.local/bin"
  mkdir -p "$dir"
fi

install -m 755 "$tmp/playerd" "$dir/playerd" 2>/dev/null ||
  { cp "$tmp/playerd" "$dir/playerd" && chmod 755 "$dir/playerd"; }

say "installed $("$dir/playerd" --version) -> $dir/playerd"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) say "note: $dir is not on your PATH — add it, e.g.: export PATH=\"$dir:\$PATH\"" ;;
esac
if [ "$os" = "Linux" ]; then
  say "note: playerd needs ALSA at runtime — on Debian/Ubuntu: sudo apt-get install libasound2"
fi
say "next: rocksky login   # or drop a token at ~/.rocksky/token.json, then run: playerd"
