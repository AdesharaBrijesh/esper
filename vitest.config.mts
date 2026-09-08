import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

// Load .env so integration tests can see TEST_DATABASE_URL (unit tests do not need it).
loadEnv({ path: path.resolve(import.meta.dirname, ".env") });

const integration = process.env.RUN_INTEGRATION === "1";

export default defineConfig({
  test: {
    include: integration ? ["tests/integration/**/*.test.ts"] : ["tests/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run them one file at a time.
    fileParallelism: !integration,
    testTimeout: integration ? 30000 : 5000,
    hookTimeout: 30000,
    // Point the Prisma client at the dedicated test database during integration runs.
    env: integration && process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {},
  },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/mocks/server-only.ts"),
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
