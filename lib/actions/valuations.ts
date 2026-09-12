"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { valuationSchema, type ValuationInput } from "@/lib/validations/account";
import { AppError, NotFoundError } from "@/lib/errors";
import { fromDateOnly } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

/**
 * Records what an investment account is worth on a date.
 *
 * One valuation per account per day: recording twice in a day replaces the earlier
 * figure rather than stacking up near-duplicates.
 */
export async function recordValuationAction(input: ValuationInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(valuationSchema, input);

    const account = await prisma.account.findFirst({
      where: { id: data.accountId, userId },
      select: { id: true, type: true, name: true },
    });
    if (!account) throw new NotFoundError("Account");
    if (account.type !== "INVESTMENT") {
      throw new AppError(`${account.name} is not an investment account.`, {
        accountId: ["Choose an investment account"],
      });
    }

    const asOf = fromDateOnly(data.asOf);
    const saved = await prisma.valuation.upsert({
      where: { accountId_asOf: { accountId: data.accountId, asOf } },
      create: { userId, accountId: data.accountId, asOf, value: data.value, notes: data.notes },
      update: { value: data.value, notes: data.notes },
      select: { id: true },
    });

    revalidateAll();
    return saved;
  });
}

export async function deleteValuationAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.valuation.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Valuation");
    await prisma.valuation.delete({ where: { id } });
    revalidateAll();
    return null;
  });
}
