import "server-only";
import { prisma } from "@/lib/prisma";
import { balancesFromAggregates, totalBalance } from "@/lib/calculations/balances";
import { toAccountDTO } from "@/lib/serialize";
import { moneyToString, toDecimal, ZERO } from "@/lib/money";
import type { AccountDTO } from "@/lib/types";
import type { OwnerFilter } from "@/lib/constants";
import type { AccountType } from "@/generated/prisma/enums";

/** Aggregated incoming/outgoing sums per account, straight from the database. */
async function loadAccountAggregates(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["toAccountId"],
      where: { userId, toAccountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["fromAccountId"],
      where: { userId, fromAccountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);
  const inc = new Map<string, string>();
  for (const row of incoming) if (row.toAccountId) inc.set(row.toAccountId, moneyToString(row._sum.amount));
  const out = new Map<string, string>();
  for (const row of outgoing) if (row.fromAccountId) out.set(row.fromAccountId, moneyToString(row._sum.amount));
  return { incoming: inc, outgoing: out };
}

/** All accounts (active by default) with derived balances. */
export async function getAccountsWithBalances(
  userId: string,
  opts: { includeInactive?: boolean; owner?: OwnerFilter } = {},
): Promise<AccountDTO[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.owner && opts.owner !== "ALL" ? { owner: opts.owner } : {}),
    },
    orderBy: [{ owner: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  if (accounts.length === 0) return [];
  const { incoming, outgoing } = await loadAccountAggregates(userId);
  const balances = balancesFromAggregates(accounts, incoming, outgoing);
  return accounts.map((a) => toAccountDTO(a, balances.get(a.id) ?? ZERO));
}

export async function getAccountById(userId: string, id: string): Promise<AccountDTO | null> {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) return null;
  const { incoming, outgoing } = await loadAccountAggregates(userId);
  const balances = balancesFromAggregates([account], incoming, outgoing);
  return toAccountDTO(account, balances.get(account.id) ?? ZERO);
}

/** Sum of balances for active accounts of the given owner ("ALL" = everyone). */
export function netWorthOf(accounts: AccountDTO[], owner: OwnerFilter = "ALL"): string {
  const balances = new Map(accounts.map((a) => [a.id, toDecimal(a.balance)]));
  return moneyToString(totalBalance(balances, accounts, { owner }));
}

export interface AccountTypeTotal {
  type: AccountType;
  total: string;
  count: number;
}

/** Totals per account type, e.g. Cash / Bank / Trading cards on the dashboard. */
export function totalsByAccountType(accounts: AccountDTO[]): AccountTypeTotal[] {
  const map = new Map<AccountType, { total: ReturnType<typeof toDecimal>; count: number }>();
  for (const a of accounts) {
    if (!a.isActive) continue;
    const row = map.get(a.type) ?? { total: ZERO, count: 0 };
    row.total = row.total.plus(toDecimal(a.balance));
    row.count += 1;
    map.set(a.type, row);
  }
  return [...map.entries()].map(([type, row]) => ({ type, total: moneyToString(row.total), count: row.count }));
}

/** Number of transactions touching an account (used to block hard deletes). */
export async function countAccountTransactions(userId: string, accountId: string): Promise<number> {
  return prisma.transaction.count({
    where: { userId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
  });
}
