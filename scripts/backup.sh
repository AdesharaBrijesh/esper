#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PostgreSQL backup for Leno Expenses (run on the Docker host, from the repo dir).
#
#   ./scripts/backup.sh                # -> ./backups/leno-expenses_YYYY-MM-DD_HHMMSS.sql.gz
#   BACKUP_DIR=/mnt/nas/backups ./scripts/backup.sh
#   KEEP_DAYS=30 ./scripts/backup.sh   # prune backups older than 30 days (default 30)
#
# Cron example (daily at 02:30):
#   30 2 * * * cd /opt/expense-tracker && ./scripts/backup.sh >> /var/log/leno-backup.log 2>&1
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
FILE="${BACKUP_DIR}/leno-expenses_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[backup] dumping ${POSTGRES_DB} -> ${FILE}"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" --clean --if-exists "$POSTGRES_DB" | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] done (${SIZE})"

if [[ "$KEEP_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -name 'leno-expenses_*.sql.gz' -type f -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] pruned /' || true
fi
