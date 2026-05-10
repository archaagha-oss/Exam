#!/usr/bin/env bash
# scripts/restore.sh — restore a Postgres dump.
#
# Usage:
#   DATABASE_URL=postgres://… ./scripts/restore.sh /path/to/secureexam-YYYYMMDDTHHMMSSZ.sql.gz
#
# Refuses to run unless CONFIRM=yes is set, since this overwrites data.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "usage: $0 <path-to-dump.sql.gz>" >&2
  exit 1
fi
if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo "Refusing to restore: set CONFIRM=yes to proceed (this overwrites $DATABASE_URL)" >&2
  exit 1
fi

echo "[$(date -u +%FT%TZ)] restoring $FILE → $DATABASE_URL"
gunzip -c "$FILE" | pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DATABASE_URL"
echo "[$(date -u +%FT%TZ)] restore complete"
