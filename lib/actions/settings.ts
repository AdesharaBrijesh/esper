"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { changePasswordSchema, profileSchema, type ChangePasswordInput, type ProfileInput } from "@/lib/validations/auth";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import {
  checkRateLimit,
  PASSWORD_CHANGE_POLICY,
  recordFailure,
  resetRateLimit,
  retryAfterLabel,
} from "@/lib/rate-limit";

export async function updateProfileAction(input: ProfileInput): Promise<ActionResult<null>> {
  const user = await requireUser();
  return runAction(async () => {
    const data = parseOrThrow(profileSchema, input);
    const taken = await prisma.user.findFirst({
      where: { email: data.email, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) throw new AppError("That email is already in use.", { email: ["Email already in use"] });
    await prisma.user.update({ where: { id: user.id }, data });
    revalidateAll();
    return null;
  });
}

/**
 * Changes the password, bumps the session version (logging out every other device)
 * and re-issues the cookie for the current device.
 */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult<null>> {
  const user = await requireUser();
  return runAction(async () => {
    const data = parseOrThrow(changePasswordSchema, input);
    // A stolen session should not become an oracle for the existing password.
    const gateKey = `password-change:${user.id}`;
    const gate = checkRateLimit(gateKey, PASSWORD_CHANGE_POLICY);
    if (!gate.ok) {
      throw new AppError(`Too many attempts. Try again in ${retryAfterLabel(gate.retryAfterSeconds)}.`);
    }
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row) throw new AppError("User not found.");
    const valid = await verifyPassword(data.currentPassword, row.passwordHash);
    if (!valid) {
      const failed = recordFailure(gateKey, PASSWORD_CHANGE_POLICY);
      if (!failed.ok) {
        throw new AppError(`Too many attempts. Try again in ${retryAfterLabel(failed.retryAfterSeconds)}.`);
      }
      throw new AppError("Current password is incorrect.", { currentPassword: ["Incorrect password"] });
    }
    resetRateLimit(gateKey);
    if (data.currentPassword === data.newPassword) {
      throw new AppError("New password must be different.", { newPassword: ["Choose a different password"] });
    }
    const passwordHash = await hashPassword(data.newPassword);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });
    await createSession(user.id, updated.sessionVersion);
    return null;
  });
}
