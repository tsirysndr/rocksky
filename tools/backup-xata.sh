#!/usr/bin/env bash
set -euo pipefail

TS="$(date -u +%Y%m%d-%H%M%SZ)"
DB_URL="$XATA_POSTGRES_URL"    # e.g. postgres://user:pass@host:5432/db
OUT="xata-db-$TS.sql.gz"
pg_dump --no-owner --no-privileges --format=plain "$DB_URL" \
  | gzip -9 > "$OUT"
sha256sum "$OUT" > "$OUT.sha256"