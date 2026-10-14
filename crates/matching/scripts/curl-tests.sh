#!/usr/bin/env bash
# Live HTTP cases: no Cargo build, credentials, or database access in this script.
set -euo pipefail
base="${1:-http://127.0.0.1:8097}"
base="${base%/}"
if [[ "$base" == --help || "$base" == -h ]]; then
  echo 'Usage: bash crates/matching/scripts/curl-tests.sh [http://127.0.0.1:8097]'
  echo 'Requires curl and jq. Calls live providers; reports HTTP/policy failures and provider warnings.'
  exit 0
fi
command -v curl >/dev/null
command -v jq >/dev/null
work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
passed=0
failed=0
warnings=0

# Each case below is a JSON curl request plus its expected HTTP status and jq assertion.
check() {
  local name="$1" expected="$2" assertion="$3" payload="${4-}" code
  printf '\n%s\n' "$name"
  if [[ "$name" == 'Health' ]]; then
    code=$(curl -sS --connect-timeout 5 --max-time 45 -o "$work_dir/body" -w '%{http_code}' "$base/health") || code=000
  else
    code=$(curl -sS --connect-timeout 5 --max-time 45 -o "$work_dir/body" -w '%{http_code}' \
      "$base/v1/match" -H 'Content-Type: application/json' --data "$payload") || code=000
  fi
  if [[ "$code" == "$expected" ]] && { [[ "$assertion" == skip ]] || jq -e "$assertion" "$work_dir/body" >/dev/null 2>&1; }; then
    printf 'PASS (HTTP %s)\n' "$code"
    passed=$((passed + 1))
  else
    printf 'FAIL (expected HTTP %s; got %s, or response assertion failed)\n' "$expected" "$code"
    failed=$((failed + 1))
  fi
  if [[ -f "$work_dir/body" ]]; then
    jq 'if has("candidates") then {status, track, candidates: [.candidates[]? | {source: .track.source, title: .track.title, album: .track.album}], rejected, warnings} else . end' "$work_dir/body" 2>/dev/null || cat "$work_dir/body"
    if jq -e '(.warnings // []) | length > 0' "$work_dir/body" >/dev/null 2>&1; then
      warnings=$((warnings + 1))
    fi
  fi
}
positive='(.status == "matched" or .status == "ambiguous") and (.candidates | length > 0)'
negative='.status == "unmatched" and .track == null and (.candidates | length == 0)'

check 'Health' 200 '.status == "ok"'
check 'Title and artist; album omitted' 200 "$positive" \
  '{"title":"Roygbiv","artists":["Boards of Canada"]}'
check 'Strict album filter' 200 "$positive and all(.candidates[]; (.track.album | ascii_downcase) == \"music has the right to children\")" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Music Has the Right to Children"}'
check 'Wrong album must not fall back' 200 "$negative" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Definitely Not The Album 849271"}'
check 'Case and whitespace normalization' 200 "$positive" \
  '{"title":"  ROYGBIV  ","artists":["boards of canada"],"album":"music has the right to children"}'
check 'Plain title must not accept an unrequested remaster' 200 "$positive and all(.candidates[]; ([.track.title, .track.album, .track.version] | map(. // \"\") | join(\" \") | test(\"remaster\"; \"i\") | not))" \
  '{"title":"Come As You Are","artists":["Nirvana"],"album":"Nevermind"}'
check 'Explicit Spotify track ID' 200 "$positive and any(.candidates[]; .track.identifiers.spotifyTrackId == \"2XQSgmtEY2titXhfY414dy\")" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Music Has the Right to Children","identifiers":{"spotifyTrackId":"2XQSgmtEY2titXhfY414dy"}}'
check 'Explicit ISRC' 200 "$positive and any(.candidates[]; .track.identifiers.isrc == \"GBBPW9800019\")" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Music Has the Right to Children","identifiers":{"isrc":"GBBPW9800019"}}'
check 'Explicit MusicBrainz recording ID' 200 "$positive and any(.candidates[]; .track.identifiers.musicbrainzRecordingId == \"2a72cd7b-f566-4c91-8e9b-7b33b95dfff7\")" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Music Has the Right to Children","identifiers":{"musicbrainzRecordingId":"2a72cd7b-f566-4c91-8e9b-7b33b95dfff7"}}'
check 'Verified ID permits version suffix differences' 200 "$positive and any(.candidates[]; .track.identifiers.spotifyTrackId == \"2XQSgmtEY2titXhfY414dy\")" \
  '{"title":"Roygbiv - Remastered","artists":["Boards of Canada"],"album":"Music Has the Right to Children","identifiers":{"spotifyTrackId":"2XQSgmtEY2titXhfY414dy"}}'
check 'Explicit ID cannot bypass wrong album' 200 "$negative" \
  '{"title":"Roygbiv","artists":["Boards of Canada"],"album":"Definitely Not The Album 849271","identifiers":{"spotifyTrackId":"2XQSgmtEY2titXhfY414dy"}}'
check 'Explicit ID cannot bypass wrong title' 200 "$negative" \
  '{"title":"Definitely Not The Song 849271","artists":["Boards of Canada"],"identifiers":{"spotifyTrackId":"2XQSgmtEY2titXhfY414dy"}}'
check 'Explicit ID cannot bypass wrong artist' 200 "$negative" \
  '{"title":"Roygbiv","artists":["Definitely Not The Artist 849271"],"identifiers":{"spotifyTrackId":"2XQSgmtEY2titXhfY414dy"}}'
check 'Missing title' 400 skip '{"artists":["Nirvana"]}'
check 'Missing artists' 400 skip '{"title":"Come As You Are"}'
check 'Blank title' 400 skip '{"title":" ","artists":["Nirvana"]}'
check 'Empty artists' 400 skip '{"title":"Come As You Are","artists":[]}'
check 'Blank album' 400 skip '{"title":"Come As You Are","artists":["Nirvana"],"album":" "}'
check 'Misspelled album field' 400 skip '{"title":"Come As You Are","artists":["Nirvana"],"albm":"Nevermind"}'
check 'Malformed JSON' 400 skip '{'

printf '\nResults: %s passed, %s failed; %s responses with provider warnings.\n' "$passed" "$failed" "$warnings"
echo 'Live results depend on provider availability and catalog changes; inspect warnings above.'
((failed == 0 && warnings == 0))
