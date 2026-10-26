#!/usr/bin/env bash
# Run from the riff project directory after its release tests.
set -euo pipefail
./cargo.sh run --release --bin riff-fixtures -- --out testdata
./cargo.sh run --release --bin riff -- --host 127.0.0.1 --port 8092 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:8092/health >/dev/null; then break; fi
  sleep 1
done
curl -sf http://127.0.0.1:8092/health | jq -e '.status == "ok"'

echo "--- GET / ---"
curl -sf http://127.0.0.1:8092/

# The query shape apps/api's matchSong actually sends.
curl -sfG http://127.0.0.1:8092/v1/search \
  --data-urlencode 'type=track' \
  --data-urlencode 'q=track:"Neon Tide" artist:"Kova Lune"' \
  | jq -e '.tracks.items[0].name == "Neon Tide"'

curl -sf http://127.0.0.1:8092/v1/albums/riffalb000000000000003 \
  | jq -e '.total_tracks == 6 and (.tracks.items | length) == 6'

curl -sf http://127.0.0.1:8092/v1/audio-features/rifftrk000000000000010 \
  | jq -e '(.danceability | type) == "number"'
