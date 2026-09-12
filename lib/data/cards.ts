import "server-only";
import { prisma } from "@/lib/prisma";
import { cardSummary, nextDueDate, nextStatementDate, totalCardPosition } from "@/lib/calculations/cards";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { moneyToString, sum, ZERO } from "@/lib/money";
import { scheduleToday } from "@/lib/calculations/plans";
import { fromDateOnly, startOfMonthDateOnly, endOfMonthDateOnly } from "@/lib/dates";
import type { CardDTO } from "@/lib/types";
import type { OwnerFilter } from "@/lib/constants";

/**
 * Credit cards.
 *
 * There is no separate card ledger: a card is an Account of type CARD, and everything
 * shown here is derived from its balance plus the limit and cycle days on the account.
 */
export async function getCards(
  userId: string,
  opts: { includeInactive?: boolean; owner?: OwnerFilter } = {},
): Promise<CardDTO[]> {
  const today = scheduleToday();
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      type: "CARD",
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.owner && opts.owner !== "ALL" ? { owner: opts.owner } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (accounts.length === 0) return [];

  const withBalances = await getAccountsWithBalances(userId, { includeInactive: true });
  const balanceById = new Map(withBalances.map((a) => [a.id, a.balance]));

  // Spend charged to each card this calendar month, for the "this month" line.
  const monthStart = fromDateOnly(startOfMonthDateOnly());
  const monthEnd = fromDateOnly(endOfMonthDateOnly());
  const spendRows = await prisma.transaction.groupBy({
    by: ["fromAccountId"],
    where: {
      userId,
      type: "EXPENSE",
      fromAccountId: { in: accounts.map((a) => a.id) },
      transactionDate: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });
  const spentById = new Map(spendRows.map((r) => [r.fromAccountId ?? "", moneyToString(r._sum.amount)]));

  return accounts.map((account) => {
    const balance = balanceById.get(account.id) ?? "0.00";
    const summary = cardSummary({ balance, creditLimit: account.creditLimit });
    return {
      id: account.id,
      name: account.name,
      owner: account.owner,
      institution: account.institution,
      last4: account.last4,
      isActive: account.isActive,
      balance,
      outstanding: moneyToString(summary.outstanding),
      creditBalance: moneyToString(summary.creditBalance),
      creditLimit: summary.limit ? moneyToString(summary.limit) : null,
      available: summary.available ? moneyToString(summary.available) : null,
      utilisation: summary.utilisation,
      level: summary.level,
      statementDay: account.statementDay,
      dueDay: account.dueDay,
      nextDueDate: nextDueDate(account.dueDay, today),
      nextStatementDate: nextStatementDate(account.statementDay, today),
      spentThisMonth: spentById.get(account.id) ?? "0.00",
    };
  });
}

export interface CardTotalsDTO {
  outstanding: string;
  limit: string;
  available: string;
  utilisation: number | null;
  cards: number;
  /** Soonest bill due date across all cards, if any have one configured. */
  nextDueDate: string | null;
}

export function cardTotals(cards: readonly CardDTO[]): CardTotalsDTO {
  const totals = totalCardPosition(cards.map((c) => ({ balance: c.balance, creditLimit: c.creditLimit })));
  const dueDates = cards.map((c) => c.nextDueDate).filter((d): d is string => Boolean(d));
  return {
    outstanding: moneyToString(totals.outstanding),
    limit: moneyToString(totals.limit),
    available: moneyToString(totals.available),
    utilisation: totals.utilisation,
    cards: totals.cards,
    nextDueDate: dueDates.length > 0 ? dueDates.sort()[0] : null,
  };
}

/** Accounts a card bill can be paid from: anything liquid. */
export async function getBillPaymentAccounts(userId: string) {
  const accounts = await getAccountsWithBalances(userId);
  return accounts.filter((a) => a.type !== "CARD" && a.type !== "TRADING" && a.type !== "INVESTMENT");
}

/** Total owed on cards, used by the dashboard without loading every card field. */
export async function getCardOutstanding(userId: string, owner: OwnerFilter = "ALL"): Promise<string> {
  const cards = await getCards(userId, { owner });
  return moneyToString(sum(cards.map((c) => c.outstanding)) ?? ZERO);
}
