import "server-only";
import { prisma } from "@/lib/prisma";
import { summarizeTrading, TRADING_TYPES, type TradingSummary } from "@/lib/calculations/trading";
import { getAccountsWithBalances, netWorthOf } from "@/lib/data/accounts";
import { toTransactionDTO, transactionInclude } from "@/lib/serialize";
import { moneyToString } from "@/lib/money";
import { fromDateOnly, type DateRange } from "@/lib/dates";
import type { AccountDTO, TransactionDTO } from "@/lib/types";
import type { OwnerFilter } from "@/lib/constants";

export interface TradingSummaryDTO {
  deposits: string;
  withdrawals: string;
  profit: string;
  loss: string;
  netResult: string;
  netInvested: string;
  profitCount: number;
  lossCount: number;
}

export function serializeTradingSummary(s: TradingSummary): TradingSummaryDTO {
  return {
    deposits: moneyToString(s.deposits),
    withdrawals: moneyToString(s.withdrawals),
    profit: moneyToString(s.profit),
    loss: moneyToString(s.loss),
    netResult: moneyToString(s.netResult),
    netInvested: moneyToString(s.netInvested),
    profitCount: s.profitCount,
    lossCount: s.lossCount,
  };
}

export interface TradingOverview {
  owner: OwnerFilter;
  /** Current balance of the trading accounts for the selected owner. */
  capital: string;
  summary: TradingSummaryDTO;
  byOwner: { SELF: TradingSummaryDTO; BROTHER: TradingSummaryDTO; ALL: TradingSummaryDTO };
  capitalByOwner: { SELF: string; BROTHER: string; ALL: string };
  tradingAccounts: AccountDTO[];
  /** Non-trading active accounts (sources/destinations for deposits & withdrawals). */
  fundingAccounts: AccountDTO[];
  transactions: TransactionDTO[];
}

/** Trading module data. Summary covers all time unless a range is given. */
export async function getTradingOverview(
  userId: string,
  owner: OwnerFilter = "ALL",
  opts: { range?: DateRange; limit?: number } = {},
): Promise<TradingOverview> {
  const [accounts, allTradingRows, recent] = await Promise.all([
    getAccountsWithBalances(userId, { includeInactive: true }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { in: [...TRADING_TYPES] },
        ...(opts.range
          ? { transactionDate: { gte: fromDateOnly(opts.range.from), lte: fromDateOnly(opts.range.to) } }
          : {}),
      },
      select: { type: true, amount: true, owner: true },
    }),
    prisma.transaction.findMany({
      where: { userId, type: { in: [...TRADING_TYPES] }, ...(owner !== "ALL" ? { owner } : {}) },
      include: transactionInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
      take: opts.limit ?? 50,
    }),
  ]);

  const tradingAccounts = accounts.filter((a) => a.type === "TRADING");
  const fundingAccounts = accounts.filter((a) => a.type !== "TRADING" && a.isActive);
  const activeTrading = tradingAccounts.filter((a) => a.isActive);

  const byOwner = {
    SELF: serializeTradingSummary(summarizeTrading(allTradingRows, "SELF")),
    BROTHER: serializeTradingSummary(summarizeTrading(allTradingRows, "BROTHER")),
    ALL: serializeTradingSummary(summarizeTrading(allTradingRows, "ALL")),
  };
  const capitalByOwner = {
    SELF: netWorthOf(activeTrading, "SELF"),
    BROTHER: netWorthOf(activeTrading, "BROTHER"),
    ALL: netWorthOf(activeTrading, "ALL"),
  };

  return {
    owner,
    capital: capitalByOwner[owner],
    summary: byOwner[owner],
    byOwner,
    capitalByOwner,
    tradingAccounts: owner === "ALL" ? tradingAccounts : tradingAccounts.filter((a) => a.owner === owner),
    fundingAccounts,
    transactions: recent.map(toTransactionDTO),
  };
}
