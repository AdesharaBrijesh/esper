#!/bin/sh
# Runs inside the "migrate" container: wait for PostgreSQL, apply migrations, seed.
set -eu

echo "[migrate] waiting for database..."
attempt=0
until node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "[migrate] database not reachable after 60 attempts" >&2
    exit 1
  fi
  sleep 2
done
echo "[migrate] database is up"

echo "[migrate] applying migrations"
npx prisma migrate deploy

echo "[migrate] seeding defaults (idempotent)"
npx tsx prisma/seed.ts

echo "[migrate] done"
