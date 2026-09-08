import { SignJWT, jwtVerify } from "jose";
import { SESSION_DURATION_DAYS } from "@/lib/constants";

/**
 * Stateless session token helpers. Safe for proxy.ts (Node runtime) and server code.
 * Never import this from client components.
 */
export interface SessionPayload {
  userId: string;
  /** Must match User.sessionVersion; bumping it revokes all existing sessions. */
  sessionVersion: number;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set to a long random string (min 16 characters)");
  }
  return new TextEncoder().encode(secret);
}

export function sessionExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
}

export async function signSessionToken(payload: SessionPayload, expiresAt: Date): Promise<string> {
  return new SignJWT({ sv: payload.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, sessionVersion: payload.sv };
  } catch {
    return null;
  }
}
