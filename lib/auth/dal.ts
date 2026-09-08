import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/auth/jwt";
import { readSessionToken } from "@/lib/auth/session";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Data Access Layer: the single source of truth for "who is logged in".
 * Verifies the signed cookie AND checks the session version in the database,
 * so password changes revoke old sessions. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;
  return { id: user.id, name: user.name, email: user.email };
});

/** Use in pages, layouts, server actions and route handlers. Redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Convenience for server actions that only need the id. */
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}
