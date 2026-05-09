#!/usr/bin/env bash
# scripts/backup.sh — daily Postgres backup → optional S3 upload.
#
# Cron example (host machine, 02:00 UTC daily):
#   0 2 * * *  /opt/secureexam/scripts/backup.sh >>/var/log/secureexam-backup.log 2>&1
#
# Required env:
#   DATABASE_URL  — postgres connection string
#   BACKUP_DIR    — local directory for dumps (default /var/backups/secureexam)
# Optional env:
#   S3_BUCKET     — s3://bucket-name/optional-prefix
#   AWS_PROFILE   — aws cli profile (default: default)
#   RETENTION_DAYS — local retention (default 30)

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/secureexam}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$BACKUP_DIR/secureexam-$TS.sql.gz"

echo "[$(date -u +%FT%TZ)] dumping → $FILE"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE"
SIZE=$(du -h "$FILE" | cut -f1)
echo "[$(date -u +%FT%TZ)] dump complete ($SIZE)"

if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[$(date -u +%FT%TZ)] uploading to $S3_BUCKET"
  aws ${AWS_PROFILE:+--profile "$AWS_PROFILE"} s3 cp "$FILE" "$S3_BUCKET/" --only-show-errors
  echo "[$(date -u +%FT%TZ)] upload complete"
fi

# Local retention
find "$BACKUP_DIR" -type f -name 'secureexam-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -u +%FT%TZ)] pruned dumps older than $RETENTION_DAYS days"
