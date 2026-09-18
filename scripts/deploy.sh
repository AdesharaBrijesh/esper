#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pulls the latest main and redeploys the Docker Compose stack in place.
#
# Run from the project directory, either by hand:
#   ./scripts/deploy.sh
#
# ...or as a restricted forced command for an SSH deploy key (see README ->
# "Continuous deployment"), which is how the GitHub Actions "deploy" job
# invokes it after CI passes on main. Either way it must run ON THE HOST,
# in a checkout that already has a working .env (deploy never touches .env).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[deploy] fetching origin/main"
git fetch --quiet origin main
git reset --hard origin/main
echo "[deploy] now at $(git rev-parse --short HEAD): $(git log -1 --format=%s)"

echo "[deploy] rebuilding and restarting"
docker compose up -d --build

echo "[deploy] waiting for the app to report healthy"
PORT="${PORT:-3000}"
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo "[deploy] healthy"
    exit 0
  fi
  sleep 2
done

echo "[deploy] app did not become healthy in time" >&2
docker compose logs --tail=80 app >&2 || true
exit 1
