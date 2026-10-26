#!/usr/bin/env bash
set -euo pipefail
apt-get update
apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libasound2-dev \
  libpcsclite-dev \
  libxdo-dev \
  libssl-dev \
  libfribidi0 \
  libharfbuzz0b \
  libgles2 \
  build-essential \
  pkg-config \
  patchelf \
  rpm \
  file \
  binutils \
  squashfs-tools \
  python3 \
  xvfb \
  xauth \
  x11-utils \
  dbus-x11

apt-get install -y curl ca-certificates git jq libdigest-sha-perl
rm -rf /var/lib/apt/lists/*
