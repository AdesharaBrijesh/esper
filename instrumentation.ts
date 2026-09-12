/**
 * Runs once per server start, before the first request is served.
 * Validating the environment here turns a misconfiguration into an immediate,
 * readable boot failure rather than a 500 on some later request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("@/lib/env");
  assertEnv();
}
