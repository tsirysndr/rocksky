#!/usr/bin/env bash
set -euo pipefail

# exit if XATA_POSTGRES_URL is not set
: "${XATA_POSTGRES_URL:?Need to set XATA_POSTGRES_URL non-empty}"

USE_PIGZ="${USE_PIGZ:-1}"
GZIP_LEVEL="${GZIP_LEVEL:-9}"      # compression level 1..9
TS="$(date -u +%Y%m%d-%H%M%SZ)"
OUT="xata-db-$TS.sql.gz"
TMPDIR="${TMPDIR:-/tmp}"
# -------------------------------------------------------------------------

log() { printf "[%s] %s\n" "$(date -u +%H:%M:%SZ)" "$*" >&2; }

# Cleanup on error/exit
cleanup() {
  [[ -f "$TMPDIR/.est_bytes.$TS" ]] && rm -f "$TMPDIR/.est_bytes.$TS" || true
}
trap cleanup EXIT

# Optional: estimate total DB size to feed pv -s <bytes>
EST_BYTES=""
if command -v psql >/dev/null 2>&1; then
  # -At: unaligned, tuples only. We ignore errors (lack of perms etc.)
  # Sum of table+index+toast for all relations in current DB
  # Note: This is an estimate of logical dump volume; actual dump size differs,
  # but it's good enough to give pv an ETA.
  set +e
  EST_BYTES="$(psql "$XATA_POSTGRES_URL" -Atc \
    "SELECT COALESCE(SUM(pg_total_relation_size(c.oid)),0)
     FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind IN ('r','p','m') AND n.nspname NOT IN ('pg_toast','pg_catalog','information_schema');" 2>/dev/null)"
  set -e
  # Validate it's an integer
  [[ "${EST_BYTES:-}" =~ ^[0-9]+$ ]] || EST_BYTES=""
  [[ -n "$EST_BYTES" ]] && echo -n "$EST_BYTES" > "$TMPDIR/.est_bytes.$TS"
fi

# Choose compressor
COMPRESSOR="gzip -${GZIP_LEVEL}"
if [[ "${USE_PIGZ}" = "1" ]] && command -v pigz >/dev/null 2>&1; then
  COMPRESSOR="pigz -${GZIP_LEVEL}"
fi

# Build the pipeline with progress
# We want: pg_dump | pv [-s EST] | (gzip|pigz) > OUT
log "Starting logical dump → ${OUT}"
if command -v pv >/dev/null 2>&1; then
  if [[ -n "${EST_BYTES}" ]]; then
    # With size estimate (shows ETA)
    pg_dump --no-owner --no-privileges --format=plain "$XATA_POSTGRES_URL" \
      | pv -ptebar -s "${EST_BYTES}" \
      | eval "$COMPRESSOR" > "$OUT"
  else
    # Without size estimate (shows rate/elapsed)
    pg_dump --no-owner --no-privileges --format=plain "$XATA_POSTGRES_URL" \
      | pv -ptebar \
      | eval "$COMPRESSOR" > "$OUT"
  fi
else
  log "pv not found; proceeding without live progress. Install 'pv' for a progress bar."
  pg_dump --no-owner --no-privileges --format=plain "$XATA_POSTGRES_URL" \
    | eval "$COMPRESSOR" > "$OUT"
fi

# Integrity file
log "Computing checksum"
sha256sum "$OUT" > "$OUT.sha256"
