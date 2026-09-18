#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Restore a backup created by scripts/backup.sh into the running postgres container.
#
#   ./scripts/restore.sh ./backups/esper_2026-09-08_023000.sql.gz
#
# WARNING: this replaces the current database contents.
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "usage: $0 <backup.sql.gz>" >&2
  exit 1
fi

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
: "${POSTGRES_USER:?POSTGRES_USER is not set (check .env)}"
: "${POSTGRES_DB:?POSTGRES_DB is not set (check .env)}"

read -r -p "This will overwrite database '${POSTGRES_DB}'. Continue? [y/N] " answer
if [[ "${answer,,}" != "y" ]]; then
  echo "aborted"
  exit 0
fi

echo "[restore] stopping app container"
docker compose stop app >/dev/null

echo "[restore] restoring ${FILE}"
gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null

echo "[restore] starting app container"
docker compose start app >/dev/null
echo "[restore] done"
