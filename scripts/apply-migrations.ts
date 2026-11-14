/**
 * Applies pending Prisma migrations over the app's own `pg` driver.
 *
 * Fallback for when `prisma migrate deploy` can't connect (its bundled schema engine
 * fails with P1001 against Neon from some Windows machines, while the Node `pg` driver
 * the app itself uses connects fine). Bookkeeping matches Prisma exactly — one row per
 * migration in "_prisma_migrations" with the SHA-256 checksum of migration.sql — so
 * `prisma migrate status` / `deploy` stay in agreement afterwards.
 *
 *   DATABASE_URL="<unpooled url>" npx tsx scripts/apply-migrations.ts           # preview only
 *   DATABASE_URL="<unpooled url>" npx tsx scripts/apply-migrations.ts --apply   # apply
 *
 * Safety:
 *  - Preview by default; nothing is written without --apply.
 *  - Refuses to run if a previous migration failed, or if an applied migration's file
 *    has changed since (checksum mismatch), or if the database knows a migration that
 *    isn't in prisma/migrations.
 *  - Each migration runs in its own transaction together with its bookkeeping row, so a
 *    failure leaves the database exactly as it was before that migration.
 */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// MIGRATIONS_DIR override exists for testing the script against a partial history.
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(__dirname, "..", "prisma", "migrations");
const apply = process.argv.includes("--apply");

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
/** A checkout may have either line ending; accept the checksum of both. */
function checksums(sql: string): string[] {
  const lf = sql.replace(/\r\n/g, "\n");
  return [sha256(sql), sha256(lf), sha256(lf.replace(/\n/g, "\r\n"))];
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable URL)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL to the target database (Neon: the unpooled URL).");

  const local = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(MIGRATIONS_DIR, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 60_000 });
  console.log(`Connecting to ${hostOf(url)} …`);
  await client.connect();
  try {
    const { rows: tableRows } = await client.query(`SELECT to_regclass('"_prisma_migrations"') AS t`);
    if (!tableRows[0].t) {
      throw new Error('No "_prisma_migrations" table: this database was never migrated. Use `prisma migrate deploy` for a fresh database.');
    }
    const { rows: applied } = await client.query<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`);

    const failed = applied.filter((m) => !m.finished_at && !m.rolled_back_at);
    if (failed.length) {
      throw new Error(`A previous migration failed and needs attention first: ${failed.map((m) => m.migration_name).join(", ")}`);
    }

    const done = new Map(applied.filter((m) => m.finished_at && !m.rolled_back_at).map((m) => [m.migration_name, m.checksum]));
    const unknown = [...done.keys()].filter((name) => !local.includes(name));
    if (unknown.length) {
      throw new Error(`The database has migrations that aren't in prisma/migrations: ${unknown.join(", ")}. Pull the latest code first.`);
    }
    for (const [name, checksum] of done) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      if (!checksums(sql).includes(checksum)) {
        throw new Error(`${name} was changed after it was applied (checksum mismatch). Refusing to continue.`);
      }
    }

    const pending = local.filter((name) => !done.has(name));
    console.log(`Applied: ${done.size}   Pending: ${pending.length}`);
    for (const name of pending) console.log(`  - ${name}`);
    if (pending.length === 0) {
      console.log("Database is up to date.");
      return;
    }
    if (!apply) {
      console.log("\nPreview only. Run again with --apply to apply these.");
      return;
    }

    for (const name of pending) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
      const id = randomUUID();
      const started = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)`,
          [id, sha256(sql), name],
        );
        await client.query(sql);
        await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
        await client.query("COMMIT");
        console.log(`✔ ${name} (${Date.now() - started}ms)`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(`${name} failed and was rolled back: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log("All pending migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
