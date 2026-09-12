import "server-only";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { investmentSummary, portfolioTotals } from "@/lib/calculations/investments";
import { moneyToString } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import type { InvestmentDTO, ValuationDTO } from "@/lib/types";
import type { OwnerFilter } from "@/lib/constants";

/**
 * Investment accounts.
 *
 * "Invested" is the account balance — money transferred in, less anything redeemed.
 * "Current value" comes from the latest Valuation you recorded; with none, the honest
 * answer is that it is worth what went in.
 */
export async function getInvestments(
  userId: string,
  opts: { includeInactive?: boolean; owner?: OwnerFilter } = {},
): Promise<InvestmentDTO[]> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      type: "INVESTMENT",
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.owner && opts.owner !== "ALL" ? { owner: opts.owner } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { valuations: { orderBy: { asOf: "desc" }, take: 24 } },
  });
  if (accounts.length === 0) return [];

  const withBalances = await getAccountsWithBalances(userId, { includeInactive: true });
  const balanceById = new Map(withBalances.map((a) => [a.id, a.balance]));

  return accounts.map((account) => {
    const balance = balanceById.get(account.id) ?? "0.00";
    const latest = account.valuations[0];
    const summary = investmentSummary({
      id: account.id,
      balance,
      latestValue: latest ? latest.value : null,
      latestValueAsOf: latest ? toDateOnly(latest.asOf) : null,
    });

    const valuations: ValuationDTO[] = account.valuations.map((v) => ({
      id: v.id,
      accountId: v.accountId,
      asOf: toDateOnly(v.asOf),
      value: moneyToString(v.value),
      notes: v.notes,
    }));

    return {
      id: account.id,
      name: account.name,
      owner: account.owner,
      institution: account.institution,
      isActive: account.isActive,
      invested: moneyToString(summary.invested),
      currentValue: moneyToString(summary.currentValue),
      gain: moneyToString(summary.gain),
      returnPercent: summary.returnPercent,
      hasValuation: summary.hasValuation,
      valuedOn: summary.valuedOn,
      valuations,
    };
  });
}

export interface PortfolioTotalsDTO {
  invested: string;
  currentValue: string;
  gain: string;
  returnPercent: number | null;
  accounts: number;
  partiallyValued: boolean;
}

export function investmentTotals(items: readonly InvestmentDTO[]): PortfolioTotalsDTO {
  const totals = portfolioTotals(
    items.map((i) => ({ id: i.id, balance: i.invested, latestValue: i.hasValuation ? i.currentValue : null })),
  );
  return {
    invested: moneyToString(totals.invested),
    currentValue: moneyToString(totals.currentValue),
    gain: moneyToString(totals.gain),
    returnPercent: totals.returnPercent,
    accounts: totals.accounts,
    partiallyValued: totals.partiallyValued,
  };
}

/** Accounts an investment can be funded from: anything liquid. */
export async function getFundingAccounts(userId: string) {
  const accounts = await getAccountsWithBalances(userId);
  return accounts.filter((a) => a.type !== "TRADING" && a.type !== "INVESTMENT");
}
