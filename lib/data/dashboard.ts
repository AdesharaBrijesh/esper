import "server-only";
import { getAccountsWithBalances, netWorthOf, totalsByAccountType, type AccountTypeTotal } from "@/lib/data/accounts";
import { getRecentTransactions, getTransactionsForReports } from "@/lib/data/transactions";
import { getLoanOverview } from "@/lib/data/loans";
import { getTradingOverview } from "@/lib/data/trading";
import { getUpcomingInstallments, getPlanTotals, type PlanTotals, type UpcomingInstallment } from "@/lib/data/plans";
import { cardTotals, getCards, type CardTotalsDTO } from "@/lib/data/cards";
import { getInvestments, investmentTotals, type PortfolioTotalsDTO } from "@/lib/data/investments";
import { incomeVsExpense, spendingByCategory } from "@/lib/calculations/reports";
import { presetRange, type DateRange } from "@/lib/dates";
import { moneyToString } from "@/lib/money";
import type { AccountDTO, TransactionDTO } from "@/lib/types";
import type { OwnerFilter } from "@/lib/constants";

export interface CategoryTotalDTO {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: string;
  count: number;
  percent: number;
}

export interface DashboardData {
  owner: OwnerFilter;
  netWorth: string;
  accounts: AccountDTO[];
  accountTypeTotals: AccountTypeTotal[];
  month: { range: DateRange; income: string; expense: string; net: string };
  spendingByCategory: CategoryTotalDTO[];
  recent: TransactionDTO[];
  loans: { youOwe: string; owedToYou: string };
  trading: { capital: string; netResult: string; profit: string; loss: string };
  /** What is due next across every active plan. */
  upcoming: UpcomingInstallment[];
  plans: PlanTotals;
  cards: CardTotalsDTO;
  investments: PortfolioTotalsDTO;
}

export async function getDashboardData(userId: string, owner: OwnerFilter = "ALL"): Promise<DashboardData> {
  const range = presetRange("this-month");
  const [accounts, monthRows, recent, loans, trading, upcoming, plans, cards, investments] = await Promise.all([
    getAccountsWithBalances(userId, { owner }),
    getTransactionsForReports(userId, range, owner),
    getRecentTransactions(userId, 8, owner),
    getLoanOverview(userId),
    getTradingOverview(userId, owner, { limit: 0 }),
    getUpcomingInstallments(userId, { daysAhead: 45, limit: 5, owner }),
    getPlanTotals(userId, owner),
    getCards(userId, { owner }),
    getInvestments(userId, { owner }),
  ]);

  const totals = incomeVsExpense(monthRows);
  const byCategory = spendingByCategory(monthRows).map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    icon: c.icon,
    color: c.color,
    total: moneyToString(c.total),
    count: c.count,
    percent: c.percent,
  }));

  return {
    owner,
    netWorth: netWorthOf(accounts, owner),
    accounts,
    accountTypeTotals: totalsByAccountType(accounts),
    month: {
      range,
      income: moneyToString(totals.income),
      expense: moneyToString(totals.expense),
      net: moneyToString(totals.net),
    },
    spendingByCategory: byCategory,
    recent,
    loans: { youOwe: loans.youOwe, owedToYou: loans.owedToYou },
    trading: {
      capital: trading.capital,
      netResult: trading.summary.netResult,
      profit: trading.summary.profit,
      loss: trading.summary.loss,
    },
    upcoming,
    plans,
    cards: cardTotals(cards),
    investments: investmentTotals(investments),
  };
}
