import "server-only";
import { revalidatePath } from "next/cache";
import { AppError, isNextControlFlowError, toUserMessage } from "@/lib/errors";
import { fail, ok, type ActionResult } from "@/lib/types";
import type { ZodType } from "zod";

/**
 * Runs a mutation and converts errors into a serializable ActionResult.
 * Next.js redirect()/notFound() signals are re-thrown untouched.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    if (err instanceof AppError) return fail(err.message, err.fieldErrors);
    return fail(toUserMessage(err));
  }
}

/** Parses with a Zod schema and throws an AppError carrying field errors. */
export function parseOrThrow<S extends ZodType>(schema: S, input: unknown): S["_output"] {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new AppError("Please fix the highlighted fields.", fieldErrors);
}

/** Balances and summaries are shown on every screen, so purge the whole app tree. */
export function revalidateAll(): void {
  revalidatePath("/", "layout");
}
