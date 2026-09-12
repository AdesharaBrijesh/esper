"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { burnPasswordComparison, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";
import { safePath } from "@/lib/safe-path";
import {
  checkRateLimit,
  clientIp,
  LOGIN_POLICY,
  recordFailure,
  resetRateLimit,
  retryAfterLabel,
} from "@/lib/rate-limit";

export interface LoginState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/** Safe redirect target: only same-origin paths. */
function safeNext(value: FormDataEntryValue | null): string {
  return safePath(value, "/");
}

function lockedMessage(retryAfterSeconds: number): string {
  return `Too many failed attempts. Try again in ${retryAfterLabel(retryAfterSeconds)}.`;
}

export async function loginAction(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { fieldErrors };
  }

  // Two keys: the IP stops a single source, the email stops a distributed attempt
  // against the one account that exists here (and cannot be spoofed away).
  const ip = await clientIp();
  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${parsed.data.email}`;

  for (const key of [ipKey, emailKey]) {
    const gate = checkRateLimit(key, LOGIN_POLICY);
    if (!gate.ok) return { error: lockedMessage(gate.retryAfterSeconds) };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true, sessionVersion: true },
  });
  // Always spend the cost of one bcrypt compare, whether or not the email exists.
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : await burnPasswordComparison(parsed.data.password);

  if (!user || !valid) {
    let worst: { ok: boolean; retryAfterSeconds: number } = { ok: true, retryAfterSeconds: 0 };
    for (const key of [ipKey, emailKey]) {
      const result = recordFailure(key, LOGIN_POLICY);
      if (!result.ok && result.retryAfterSeconds > worst.retryAfterSeconds) worst = result;
    }
    if (!worst.ok) return { error: lockedMessage(worst.retryAfterSeconds) };
    return { error: "Incorrect email or password." };
  }

  resetRateLimit(ipKey);
  resetRateLimit(emailKey);

  await createSession(user.id, user.sessionVersion);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
