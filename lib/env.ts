/**
 * Environment validation.
 *
 * Runs once when the server boots (see instrumentation.ts) so a misconfigured
 * deployment fails immediately with a readable message, instead of throwing a
 * 500 on the first request that happens to need the value.
 */
import { z } from "zod";

/** Values shipped in .env.example / .env.docker. Never acceptable in production. */
const PLACEHOLDER_SECRETS = [
  "CHANGE_ME",
  "dev-only-secret-change-me-please-32chars-min-0123456789",
  "docker-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
  "changeme",
  "secret",
];

const MIN_SECRET_LENGTH_PROD = 32;
const MIN_SECRET_LENGTH_DEV = 16;

const booleanish = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
        message: "DATABASE_URL must be a postgres:// or postgresql:// connection string",
      }),
    TEST_DATABASE_URL: z.string().optional(),
    AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
    COOKIE_SECURE: booleanish,
    TZ: z.string().optional(),
    PORT: z.string().optional(),
    SEED_USER_NAME: z.string().optional(),
    SEED_USER_EMAIL: z.string().optional(),
    SEED_USER_PASSWORD: z.string().optional(),
    SEED_EXAMPLE_ACCOUNTS: z.string().optional(),
    NEXT_PUBLIC_APP_NAME: z.string().optional(),
    NEXT_PUBLIC_THEME_COLOR: z.string().optional(),
    /** "nonce" (default), "basic" (no nonce, allows inline scripts) or "off". */
    CSP_MODE: z.enum(["nonce", "basic", "off"]).default("nonce"),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === "production";
    const min = isProd ? MIN_SECRET_LENGTH_PROD : MIN_SECRET_LENGTH_DEV;
    if (env.AUTH_SECRET.length < min) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: `AUTH_SECRET must be at least ${min} characters (generate with: openssl rand -base64 48)`,
      });
    }
    if (isProd && PLACEHOLDER_SECRETS.some((p) => env.AUTH_SECRET.includes(p))) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET is still an example value. Generate a real one: openssl rand -base64 48",
      });
    }
    if (isProd && env.SEED_USER_PASSWORD && env.SEED_USER_PASSWORD.length < 8) {
      ctx.addIssue({
        code: "custom",
        path: ["SEED_USER_PASSWORD"],
        message: "SEED_USER_PASSWORD must be at least 8 characters",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface EnvCheck {
  ok: boolean;
  problems: string[];
}

/** Validates process.env without throwing. Used by instrumentation and by scripts. */
export function checkEnv(source: NodeJS.ProcessEnv = process.env): EnvCheck {
  const result = envSchema.safeParse(source);
  if (result.success) return { ok: true, problems: [] };
  return {
    ok: false,
    problems: result.error.issues.map((i) => {
      const key = i.path.length ? String(i.path[0]) : "env";
      return `${key}: ${i.message}`;
    }),
  };
}

/**
 * Fails the boot in production, warns loudly in development.
 * Development keeps running so a half-configured .env is still workable.
 */
export function assertEnv(source: NodeJS.ProcessEnv = process.env): void {
  const { ok, problems } = checkEnv(source);
  if (ok) return;
  const message = ["Invalid environment configuration:", ...problems.map((p) => `  - ${p}`)].join("\n");
  if (source.NODE_ENV === "production") throw new Error(message);
  console.warn(`[env] ${message}`);
}

/** Reads CSP_MODE with the same default the schema applies. */
export function cspMode(): "nonce" | "basic" | "off" {
  const raw = process.env.CSP_MODE;
  return raw === "basic" || raw === "off" ? raw : "nonce";
}
