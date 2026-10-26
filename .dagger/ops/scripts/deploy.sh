#!/usr/bin/env bash
set -euo pipefail
cd /src
trap 'rm -f /root/.ssh/id_ed25519 /root/.ssh/id_ed25519.pub' EXIT
# Setup SSH
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "$SSH_PRIVATE_KEY" | base64 -d > ~/.ssh/id_ed25519
echo "$SSH_PUBLIC_KEY"  | base64 -d > ~/.ssh/id_ed25519.pub
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
ssh-keyscan -H ssh.rocksky.app >> ~/.ssh/known_hosts

# Pull latest on server
ssh root@ssh.rocksky.app 'cd /root/github/rocksky && git pull origin main && mkdir -p target/release'

if [ "$DEPLOY_API" = true ]; then
export API_SERVICES='rocksky rocksky-xrpc'
# Build apps/api on server and restart
ssh root@ssh.rocksky.app "set -e; \
  cd /root/github/rocksky/apps/api && \
  /bin/bash -ic 'bun install --frozen-lockfile && bun run build'; \
  systemctl restart $API_SERVICES; \
  systemctl --no-pager --lines=0 status $API_SERVICES"

fi
if [ "$DEPLOY_ROCKSKYD" = true ]; then
export ROCKSKYD_SERVICES='rocksky-jetstream rocksky-scrobbler rocksky-spotify rocksky-webscrobbler rocksky-navidrome rocksky-matching'
# Deploy rockskyd binary
chmod +x target/release/rockskyd
scp target/release/rockskyd root@ssh.rocksky.app:/root/github/rocksky/target/release/rockskyd.new
ssh root@ssh.rocksky.app "set -e; \
  systemctl stop $ROCKSKYD_SERVICES; \
  mv /root/github/rocksky/target/release/rockskyd.new /root/github/rocksky/target/release/rockskyd; \
  chmod +x /root/github/rocksky/target/release/rockskyd; \
  systemctl start $ROCKSKYD_SERVICES; \
  systemctl --no-pager --lines=0 status $ROCKSKYD_SERVICES"

fi
if [ "$DEPLOY_EMBED" = true ]; then
# Restart rocksky-embed
ssh root@ssh.rocksky.app 'set -e; systemctl restart rocksky-embed; systemctl --no-pager --lines=0 status rocksky-embed'

fi
if [ "$DEPLOY_FEEDS" = true ]; then
# Restart rocksky-feeds
ssh root@ssh.rocksky.app 'set -e; systemctl restart rocksky-feeds; systemctl --no-pager --lines=0 status rocksky-feeds'

fi
if [ "$DEPLOY_WS" = true ]; then
# Restart rocksky-ws
ssh root@ssh.rocksky.app 'set -e; systemctl restart rocksky-ws; systemctl --no-pager --lines=0 status rocksky-ws'

fi
if [ "$DEPLOY_MB" = true ]; then
# Restart rocksky-mb
ssh root@ssh.rocksky.app 'set -e; systemctl restart rocksky-mb; systemctl --no-pager --lines=0 status rocksky-mb'

fi
