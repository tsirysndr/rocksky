#!/usr/bin/env bash

set -euo pipefail

: "${CF_ACCOUNT_ID:?Need to set CF_ACCOUNT_ID}"

aws s3 cp rocksky-analytics.ddb s3://rocksky-backup --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com --profile r2

aws s3 cp rocksky-analytics.ddb.wal s3://rocksky-backup --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com --profile r2 || true

aws s3 cp rocksky-feed.ddb s3://rocksky-backup --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com --profile r2

aws s3 cp rocksky-feed.ddb.wal s3://rocksky-backup --endpoint-url https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com --profile r2 || true

echo "Backup completed successfully."