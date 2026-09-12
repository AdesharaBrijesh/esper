// Runs the database-backed tests against TEST_DATABASE_URL (migrating it first).
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

loadEnv();

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  // Skipping locally is a convenience; skipping in CI would mean "tests passed" was
  // reported for a suite that never ran.
  if (process.env.CI) {
    console.error("TEST_DATABASE_URL is not set. Integration tests are required in CI.");
    process.exit(1);
  }
  console.error("TEST_DATABASE_URL is not set in .env - skipping integration tests.");
  process.exit(0);
}

const env = { ...process.env, DATABASE_URL: url, RUN_INTEGRATION: "1" };
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (args) => spawnSync(npx, args, { stdio: "inherit", env, shell: process.platform === "win32" });

console.log("[integration] applying migrations to the test database");
let r = run(["prisma", "migrate", "deploy"]);
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("[integration] running tests");
r = run(["vitest", "run"]);
process.exit(r.status ?? 1);
