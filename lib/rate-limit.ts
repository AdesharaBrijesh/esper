import "server-only";
import { headers } from "next/headers";

/**
 * In-memory rate limiting with escalating lockout.
 *
 * This app runs as a single container with a single user, so a process-local map is
 * the right amount of machinery: no Redis, no extra service, and a restart simply
 * clears the counters. If this ever runs multiple replicas, move `buckets` to the
 * database or a shared cache.
 */

export interface RateLimitPolicy {
  /** Failures allowed inside `windowMs` before the key locks. */
  limit: number;
  windowMs: number;
  /** Lockout applied on the first trip; doubles on each subsequent trip, up to `maxLockoutMs`. */
  lockoutMs: number;
  maxLockoutMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

interface Bucket {
  failures: number[];
  /** Epoch ms; 0 when not locked. */
  lockedUntil: number;
  /** How many times this key has tripped the limit (drives the exponential backoff). */
  trips: number;
  touchedAt: number;
}

/** Login is the sensitive one: five wrong passwords, then a growing timeout. */
export const LOGIN_POLICY: RateLimitPolicy = {
  limit: 5,
  windowMs: 15 * 60_000,
  lockoutMs: 60_000,
  maxLockoutMs: 30 * 60_000,
};

/** Password change already requires a valid session, so it can be looser. */
export const PASSWORD_CHANGE_POLICY: RateLimitPolicy = {
  limit: 5,
  windowMs: 10 * 60_000,
  lockoutMs: 60_000,
  maxLockoutMs: 10 * 60_000,
};

const MAX_KEYS = 5_000;
const buckets = new Map<string, Bucket>();

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    const idle = now - bucket.touchedAt;
    if (bucket.lockedUntil <= now && idle > 60 * 60_000) buckets.delete(key);
  }
  // Hard cap so a flood of spoofed keys cannot grow the map without bound.
  if (buckets.size > MAX_KEYS) {
    const excess = buckets.size - MAX_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++removed >= excess) break;
    }
  }
}

function bucketFor(key: string, now: number): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { failures: [], lockedUntil: 0, trips: 0, touchedAt: now };
    buckets.set(key, bucket);
  }
  bucket.touchedAt = now;
  return bucket;
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** Read-only check. Call before doing the expensive work (a bcrypt compare). */
export function checkRateLimit(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
  prune(now);
  const bucket = buckets.get(key);
  if (!bucket) return { ok: true, retryAfterSeconds: 0, remaining: policy.limit };
  if (bucket.lockedUntil > now) {
    return { ok: false, retryAfterSeconds: seconds(bucket.lockedUntil - now), remaining: 0 };
  }
  const recent = bucket.failures.filter((t) => now - t < policy.windowMs);
  return { ok: true, retryAfterSeconds: 0, remaining: Math.max(0, policy.limit - recent.length) };
}

/** Records one failed attempt and locks the key once the limit is reached. */
export function recordFailure(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
  prune(now);
  const bucket = bucketFor(key, now);
  bucket.failures = bucket.failures.filter((t) => now - t < policy.windowMs);
  bucket.failures.push(now);

  if (bucket.failures.length >= policy.limit) {
    const backoff = Math.min(policy.lockoutMs * 2 ** bucket.trips, policy.maxLockoutMs);
    bucket.trips += 1;
    bucket.lockedUntil = now + backoff;
    bucket.failures = [];
    return { ok: false, retryAfterSeconds: seconds(backoff), remaining: 0 };
  }
  return { ok: true, retryAfterSeconds: 0, remaining: policy.limit - bucket.failures.length };
}

/** Clears a key after a successful attempt. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Test seam. */
export function clearAllRateLimits(): void {
  buckets.clear();
}

/**
 * Best-effort client IP.
 *
 * Forwarded headers are trivially spoofable unless a trusted reverse proxy sets them,
 * which is why every caller also rate-limits on a non-spoofable key (the submitted
 * email). Cloudflare Tunnel and the usual proxies set one of these.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const direct = h.get("cf-connecting-ip") ?? h.get("x-real-ip");
  if (direct) return direct.trim();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Human-friendly "try again in ..." fragment. */
export function retryAfterLabel(retryAfterSeconds: number): string {
  if (retryAfterSeconds < 60) return `${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
