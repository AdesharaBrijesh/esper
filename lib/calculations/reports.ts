import { Decimal, toDecimal, ZERO, type MoneyInput } from "@/lib/money";
import { monthKeyOf, type DateOnly } from "@/lib/dates";
import type { Owner, PaymentMode, TransactionType } from "@/generated/prisma/enums";

/**
 * Report aggregations (pure functions).
 *
 * Spending  = EXPENSE transactions only.
 * Income    = INCOME transactions only.
 * Trading profit/loss and loans are reported separately (see trading.ts / loans.ts)
 * so that transfers and capital movements never pollute spending numbers.
 */
export interface ReportTransactionLike {
  type: TransactionType;
  amount: MoneyInput;
  owner: Owner;
  paymentMode: PaymentMode;
  transactionDate: DateOnly | Date;
  categoryId?: string | null;
  category?: { id: string; name: string; icon: string | null; color: string | null } | null;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: Decimal;
  count: number;
  /** 0-100 share of the grand total */
  percent: number;
}

const UNCATEGORIZED = { id: "uncategorized", name: "Uncategorised", icon: "❔", color: "#94a3b8" };

function percentOf(part: Decimal, whole: Decimal): number {
  if (whole.isZero()) return 0;
  return Number(part.dividedBy(whole).times(100).toFixed(1));
}

export function totalsByCategory(
  transactions: Iterable<ReportTransactionLike>,
  type: "EXPENSE" | "INCOME" = "EXPENSE",
): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  let grand = ZERO;
  for (const t of transactions) {
    if (t.type !== type) continue;
    const cat = t.category ?? (t.categoryId ? { id: t.categoryId, name: "Unknown", icon: null, color: null } : UNCATEGORIZED);
    let row = map.get(cat.id);
    if (!row) {
      row = { categoryId: cat.id, name: cat.name, icon: cat.icon, color: cat.color, total: ZERO, count: 0, percent: 0 };
      map.set(cat.id, row);
    }
    const amt = toDecimal(t.amount);
    row.total = row.total.plus(amt);
    row.count += 1;
    grand = grand.plus(amt);
  }
  const rows = [...map.values()].sort((a, b) => b.total.comparedTo(a.total));
  for (const r of rows) r.percent = percentOf(r.total, grand);
  return rows;
}

/** Spending by category (EXPENSE only). */
export function spendingByCategory(transactions: Iterable<ReportTransactionLike>): CategoryTotal[] {
  return totalsByCategory(transactions, "EXPENSE");
}

export interface IncomeExpenseTotals {
  income: Decimal;
  expense: Decimal;
  /** income - expense */
  net: Decimal;
}

export function incomeVsExpense(transactions: Iterable<ReportTransactionLike>): IncomeExpenseTotals {
  let income = ZERO;
  let expense = ZERO;
  for (const t of transactions) {
    if (t.type === "INCOME") income = income.plus(toDecimal(t.amount));
    else if (t.type === "EXPENSE") expense = expense.plus(toDecimal(t.amount));
  }
  return { income, expense, net: income.minus(expense) };
}

export interface MonthlyPoint extends IncomeExpenseTotals {
  /** "YYYY-MM" */
  month: string;
}

/** Income/expense per month for the given ordered month keys (missing months are zero). */
export function monthlyTrend(transactions: Iterable<ReportTransactionLike>, monthKeys: readonly string[]): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();
  for (const m of monthKeys) map.set(m, { month: m, income: ZERO, expense: ZERO, net: ZERO });
  for (const t of transactions) {
    const key = monthKeyOf(t.transactionDate);
    const row = map.get(key);
    if (!row) continue;
    if (t.type === "INCOME") row.income = row.income.plus(toDecimal(t.amount));
    else if (t.type === "EXPENSE") row.expense = row.expense.plus(toDecimal(t.amount));
    row.net = row.income.minus(row.expense);
  }
  return [...map.values()];
}

export interface OwnerTotals extends IncomeExpenseTotals {
  owner: Owner;
}

export function ownerBreakdown(transactions: Iterable<ReportTransactionLike>): OwnerTotals[] {
  const rows: Record<Owner, OwnerTotals> = {
    SELF: { owner: "SELF", income: ZERO, expense: ZERO, net: ZERO },
    BROTHER: { owner: "BROTHER", income: ZERO, expense: ZERO, net: ZERO },
  };
  for (const t of transactions) {
    const row = rows[t.owner];
    if (!row) continue;
    if (t.type === "INCOME") row.income = row.income.plus(toDecimal(t.amount));
    else if (t.type === "EXPENSE") row.expense = row.expense.plus(toDecimal(t.amount));
    row.net = row.income.minus(row.expense);
  }
  return [rows.SELF, rows.BROTHER];
}

export interface PaymentModeTotal {
  mode: PaymentMode;
  total: Decimal;
  count: number;
  percent: number;
}

/** Spending split by payment mode (EXPENSE only). */
export function paymentModeBreakdown(transactions: Iterable<ReportTransactionLike>): PaymentModeTotal[] {
  const map = new Map<PaymentMode, PaymentModeTotal>();
  let grand = ZERO;
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    let row = map.get(t.paymentMode);
    if (!row) {
      row = { mode: t.paymentMode, total: ZERO, count: 0, percent: 0 };
      map.set(t.paymentMode, row);
    }
    const amt = toDecimal(t.amount);
    row.total = row.total.plus(amt);
    row.count += 1;
    grand = grand.plus(amt);
  }
  const rows = [...map.values()].sort((a, b) => b.total.comparedTo(a.total));
  for (const r of rows) r.percent = percentOf(r.total, grand);
  return rows;
}

/** Cash vs online spending (online = everything that is not CASH). */
export function cashVsOnline(transactions: Iterable<ReportTransactionLike>): { cash: Decimal; online: Decimal } {
  let cash = ZERO;
  let online = ZERO;
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;
    if (t.paymentMode === "CASH") cash = cash.plus(toDecimal(t.amount));
    else online = online.plus(toDecimal(t.amount));
  }
  return { cash, online };
}

/** Sum of amounts for transactions matching a predicate. */
export function sumWhere(transactions: Iterable<ReportTransactionLike>, pred: (t: ReportTransactionLike) => boolean): Decimal {
  let total = ZERO;
  for (const t of transactions) if (pred(t)) total = total.plus(toDecimal(t.amount));
  return total;
}
