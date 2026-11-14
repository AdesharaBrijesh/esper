"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { createTransaction } from "@/lib/services/transactions";
import { quickAddSchema, type QuickAddInput } from "@/lib/validations/quick-add";
import { AppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export interface QuickAddResult {
  created: number;
  /** Index into the submitted entries, with the reason it was not saved. */
  failed: { index: number; error: string }[];
}

/** Saves a batch of quick-add expenses. Each one goes through the normal transaction rules. */
export async function quickAddExpensesAction(input: QuickAddInput): Promise<ActionResult<QuickAddResult>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(quickAddSchema, input);
    const accountIds = [...new Set(data.entries.map((e) => e.accountId))];
    const accounts = await prisma.account.findMany({
      where: { userId, id: { in: accountIds } },
      select: { id: true, owner: true },
    });
    const ownerOf = new Map(accounts.map((a) => [a.id, a.owner] as const));

    let created = 0;
    const failed: QuickAddResult["failed"] = [];
    for (const [index, e] of data.entries.entries()) {
      try {
        await createTransaction(userId, {
          type: "EXPENSE",
          amount: e.amount,
          transactionDate: data.date,
          owner: ownerOf.get(e.accountId) ?? "SELF",
          paymentMode: e.paymentMode,
          notes: e.description,
          fromAccountId: e.accountId,
          toAccountId: "",
          categoryId: e.categoryId,
        });
        created++;
      } catch (err) {
        failed.push({ index, error: err instanceof AppError ? err.message : "Could not save this one" });
      }
    }
    if (created > 0) revalidateAll();
    return { created, failed };
  });
}
