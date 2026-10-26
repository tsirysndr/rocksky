#!/bin/sh
set -eu
cd /src
cachix_path=$(nix build --inputs-from . nixpkgs#cachix --no-link --print-out-paths)
"$cachix_path/bin/cachix" use rocksky
nix build ./apps/cli --print-build-logs -o result-cli
nix build .#playerd --print-build-logs -o result-playerd
nix build .#rockskyd --print-build-logs -o result-rockskyd
nix build .#drift --print-build-logs -o result-drift
nix build .#riff --print-build-logs -o result-riff
nix build .#deezer --print-build-logs -o result-deezer
nix build .#spotify --print-build-logs -o result-spotify
nix build .#musicbrainz --print-build-logs -o result-musicbrainz
# Preserve the existing Linux desktop hash-mismatch allowance.
if ! nix build .#rocksky-desktop --print-build-logs -o result-rocksky-desktop; then echo "Linux desktop Nix build remains best-effort"; fi
ls -la result-*/
if [ -n "${CACHIX_AUTH_TOKEN:-}" ]; then
  for result in result-*; do [ ! -e "$result" ] || "$cachix_path/bin/cachix" push rocksky "$result"; done
fi
