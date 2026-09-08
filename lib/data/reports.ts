import "server-only";
import { getTransactionsForReports } from "@/lib/data/transactions";
import { getTradingOverview, type TradingSummaryDTO } from "@/lib/data/trading";
import { getLoanOverview } from "@/lib/data/loans";
import {
  cashVsOnline,
  incomeVsExpense,
  monthlyTrend,
  ownerBreakdown,
  paymentModeBreakdown,
  spendingByCategory,
  totalsByCategory,
} from "@/lib/calculations/reports";
import { formatMonthKey, monthKeysBetween, type DateRange } from "@/lib/dates";
import { moneyToString } from "@/lib/money";
import type { CategoryTotalDTO } from "@/lib/data/dashboard";
import type { Owner, PaymentMode } from "@/generated/prisma/enums";
import type { OwnerFilter } from "@/lib/constants";

export interface MonthlyPointDTO {
  month: string;
  label: string;
  income: string;
  expense: string;
  net: string;
}

export interface OwnerTotalsDTO {
  owner: Owner;
  income: string;
  expense: string;
  net: string;
}

export interface PaymentModeTotalDTO {
  mode: PaymentMode;
  total: string;
  count: number;
  percent: number;
}

export interface ReportData {
  range: DateRange;
  owner: OwnerFilter;
  totals: { income: string; expense: string; net: string; transactionCount: number };
  spendingByCategory: CategoryTotalDTO[];
  incomeByCategory: CategoryTotalDTO[];
  monthly: MonthlyPointDTO[];
  owners: OwnerTotalsDTO[];
  paymentModes: PaymentModeTotalDTO[];
  cashVsOnline: { cash: string; online: string };
  trading: { SELF: TradingSummaryDTO; BROTHER: TradingSummaryDTO; ALL: TradingSummaryDTO };
  tradingCapital: { SELF: string; BROTHER: string; ALL: string };
  loans: { youOwe: string; owedToYou: string; net: string };
}

export async function getReportData(userId: string, range: DateRange, owner: OwnerFilter = "ALL"): Promise<ReportData> {
  const [rows, trading, loans] = await Promise.all([
    getTransactionsForReports(userId, range, owner),
    getTradingOverview(userId, owner, { range, limit: 0 }),
    getLoanOverview(userId),
  ]);

  const totals = incomeVsExpense(rows);
  const serializeCat = (c: ReturnType<typeof spendingByCategory>[number]): CategoryTotalDTO => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    total: moneyToString(c.total),
    count: c.count,
    percent: c.percent,
  });
  const months = monthKeysBetween(range.from, range.to);
  const cvo = cashVsOnline(rows);

  return {
    range,
    owner,
    totals: {
      income: moneyToString(totals.income),
      expense: moneyToString(totals.expense),
      net: moneyToString(totals.net),
      transactionCount: rows.length,
    },
    spendingByCategory: spendingByCategory(rows).map(serializeCat),
    incomeByCategory: totalsByCategory(rows, "INCOME").map(serializeCat),
    monthly: monthlyTrend(rows, months).map((m) => ({
      month: m.month,
      label: formatMonthKey(m.month),
      income: moneyToString(m.income),
      expense: moneyToString(m.expense),
      net: moneyToString(m.net),
    })),
    owners: ownerBreakdown(rows).map((o) => ({
      owner: o.owner,
      income: moneyToString(o.income),
      expense: moneyToString(o.expense),
      net: moneyToString(o.net),
    })),
    paymentModes: paymentModeBreakdown(rows).map((p) => ({
      mode: p.mode,
      total: moneyToString(p.total),
      count: p.count,
      percent: p.percent,
    })),
    cashVsOnline: { cash: moneyToString(cvo.cash), online: moneyToString(cvo.online) },
    trading: trading.byOwner,
    tradingCapital: trading.capitalByOwner,
    loans: { youOwe: loans.youOwe, owedToYou: loans.owedToYou, net: loans.net },
  };
}
