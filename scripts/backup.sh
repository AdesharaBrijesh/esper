#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PostgreSQL backup for Esper (run on the Docker host, from the repo dir).
#
#   ./scripts/backup.sh                # -> ./backups/esper_YYYY-MM-DD_HHMMSS.sql.gz
#   BACKUP_DIR=/mnt/nas/backups ./scripts/backup.sh
#   KEEP_DAYS=30 ./scripts/backup.sh   # prune backups older than 30 days (default 30)
#
# Cron example (daily at 02:30):
#   30 2 * * * cd /opt/expense-tracker && ./scripts/backup.sh >> /var/log/esper-backup.log 2>&1
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER is not set (check .env)}"
: "${POSTGRES_DB:?POSTGRES_DB is not set (check .env)}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
FILE="${BACKUP_DIR}/esper_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# Write to a temporary file first. Redirecting straight into $FILE creates the file
# before pg_dump runs, so a failed dump would leave a truncated archive sitting in the
# backup directory looking exactly like a good one.
TMP="${FILE}.partial"
trap 'rm -f "$TMP"' EXIT

echo "[backup] dumping ${POSTGRES_DB} -> ${FILE}"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" --clean --if-exists "$POSTGRES_DB" | gzip -9 > "$TMP"

# Verify before trusting it: a backup you have never checked is not a backup.
echo "[backup] verifying archive"
if ! gzip -t "$TMP"; then
  echo "[backup] FAILED: archive is corrupt" >&2
  exit 1
fi

BYTES=$(wc -c < "$TMP" | tr -d '[:space:]')
MIN_BYTES="${MIN_BYTES:-1024}"
if [[ "$BYTES" -lt "$MIN_BYTES" ]]; then
  echo "[backup] FAILED: archive is only ${BYTES} bytes (expected at least ${MIN_BYTES})" >&2
  exit 1
fi

if ! gunzip -c "$TMP" | head -c 4096 | grep -q "PostgreSQL database dump"; then
  echo "[backup] FAILED: archive does not look like a pg_dump" >&2
  exit 1
fi

mv "$TMP" "$FILE"
trap - EXIT

SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] done (${SIZE}, verified)"

if [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'esper_*.sql.gz' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] pruned /' || true
fi
