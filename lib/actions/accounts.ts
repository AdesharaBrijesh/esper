"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { accountSchema, type AccountInput } from "@/lib/validations/account";
import { AppError, NotFoundError } from "@/lib/errors";
import { countAccountTransactions } from "@/lib/data/accounts";
import { isPortfolioAccount } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

export async function createAccountAction(input: AccountInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(accountSchema, input);
    const count = await prisma.account.count({ where: { userId } });
    const created = await prisma.account.create({
      data: { userId, ...data, sortOrder: count },
      select: { id: true },
    });
    revalidateAll();
    return created;
  });
}

export async function updateAccountAction(id: string, input: AccountInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(accountSchema, input);
    const existing = await prisma.account.findFirst({ where: { id, userId }, select: { id: true, type: true, owner: true } });
    if (!existing) throw new NotFoundError("Account");
    const used = existing.type !== data.type || existing.owner !== data.owner ? await countAccountTransactions(userId, id) : 0;
    // Portfolio accounts follow different flow rules, so switching an account in or out
    // of one once it has history would retroactively invalidate those transactions.
    if (existing.type !== data.type && used > 0 && (isPortfolioAccount(existing.type) || isPortfolioAccount(data.type))) {
      throw new AppError("Cannot change an account to or from Trading/Investment once it has transactions.");
    }
    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id }, data });
      // Trading money is attributed to the trading account's owner; keep history consistent.
      if (existing.owner !== data.owner && existing.type === "TRADING" && used > 0) {
        await tx.transaction.updateMany({
          where: {
            userId,
            type: { in: ["TRADING_DEPOSIT", "TRADING_WITHDRAWAL", "TRADING_PROFIT", "TRADING_LOSS"] },
            OR: [{ fromAccountId: id }, { toAccountId: id }],
          },
          data: { owner: data.owner },
        });
      }
    });
    revalidateAll();
    return { id };
  });
}

/** Archive (isActive=false) or restore an account. Archived accounts keep their history. */
export async function setAccountActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.account.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Account");
    await prisma.account.update({ where: { id }, data: { isActive } });
    revalidateAll();
    return null;
  });
}

/** Hard delete, only allowed when the account has no transactions. */
export async function deleteAccountAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.account.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Account");
    const used = await countAccountTransactions(userId, id);
    if (used > 0) {
      throw new AppError("This account has transactions. Archive it instead of deleting.");
    }
    await prisma.account.delete({ where: { id } });
    revalidateAll();
    return null;
  });
}
