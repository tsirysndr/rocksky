#!/usr/bin/env bash
set -euo pipefail

# exit if XATA_POSTGRES_URL is not set
: "${XATA_POSTGRES_URL:?Need to set XATA_POSTGRES_URL non-empty}"

BACKUP_NAME="xata-backup-$(date +%Y%m%d-%H%M%S).dump"

pg_dump $XATA_POSTGRES_URL --no-owner --no-acl -Fc | pv -pteba > "$BACKUP_NAME"
