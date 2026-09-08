import { describe, expect, it } from "vitest";
import {
  cashVsOnline,
  incomeVsExpense,
  monthlyTrend,
  ownerBreakdown,
  paymentModeBreakdown,
  spendingByCategory,
  totalsByCategory,
  type ReportTransactionLike,
} from "@/lib/calculations/reports";

const food = { id: "c-food", name: "Food", icon: "🍔", color: "#f97316" };
const travel = { id: "c-travel", name: "Travel", icon: "🚌", color: "#0ea5e9" };
const salary = { id: "c-salary", name: "Salary", icon: "💼", color: "#22c55e" };

const rows: ReportTransactionLike[] = [
  { type: "EXPENSE", amount: "300", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-08-03", category: food },
  { type: "EXPENSE", amount: "700", owner: "SELF", paymentMode: "UPI", transactionDate: "2026-08-10", category: food },
  { type: "EXPENSE", amount: "1000", owner: "BROTHER", paymentMode: "CARD", transactionDate: "2026-09-01", category: travel },
  { type: "EXPENSE", amount: "50", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-09-02", category: null },
  { type: "INCOME", amount: "25000", owner: "SELF", paymentMode: "BANK", transactionDate: "2026-09-01", category: salary },
  { type: "INCOME", amount: "5000", owner: "BROTHER", paymentMode: "BANK", transactionDate: "2026-08-15", category: salary },
  // These must never count as spending or income:
  { type: "TRANSFER", amount: "9999", owner: "SELF", paymentMode: "TRANSFER", transactionDate: "2026-09-01" },
  { type: "TRADING_DEPOSIT", amount: "9999", owner: "SELF", paymentMode: "TRANSFER", transactionDate: "2026-09-01" },
  { type: "TRADING_PROFIT", amount: "9999", owner: "SELF", paymentMode: "OTHER", transactionDate: "2026-09-01" },
  { type: "TRADING_LOSS", amount: "9999", owner: "SELF", paymentMode: "OTHER", transactionDate: "2026-09-01" },
  { type: "BORROW", amount: "9999", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-09-01" },
  { type: "LEND", amount: "9999", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-09-01" },
  { type: "LOAN_REPAYMENT", amount: "9999", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-09-01" },
  { type: "LENT_REPAYMENT", amount: "9999", owner: "SELF", paymentMode: "CASH", transactionDate: "2026-09-01" },
];

describe("spendingByCategory", () => {
  it("groups EXPENSE only, sorted by total, with percentages", () => {
    const cats = spendingByCategory(rows);
    expect(cats.map((c) => c.name)).toEqual(["Food", "Travel", "Uncategorised"]);
    expect(cats[0].total.toFixed(2)).toBe("1000.00");
    expect(cats[0].count).toBe(2);
    expect(cats[0].percent).toBeCloseTo(48.8, 1);
    expect(cats[1].total.toFixed(2)).toBe("1000.00");
    expect(cats[2].total.toFixed(2)).toBe("50.00");
    const sum = cats.reduce((a, c) => a.plus(c.total), cats[0].total.minus(cats[0].total));
    expect(sum.toFixed(2)).toBe("2050.00");
  });

  it("income by category uses INCOME only", () => {
    const cats = totalsByCategory(rows, "INCOME");
    expect(cats).toHaveLength(1);
    expect(cats[0].name).toBe("Salary");
    expect(cats[0].total.toFixed(2)).toBe("30000.00");
    expect(cats[0].percent).toBe(100);
  });
});

describe("incomeVsExpense", () => {
  it("excludes transfers, trading and loan movements", () => {
    const t = incomeVsExpense(rows);
    expect(t.income.toFixed(2)).toBe("30000.00");
    expect(t.expense.toFixed(2)).toBe("2050.00");
    expect(t.net.toFixed(2)).toBe("27950.00");
  });
});

describe("monthlyTrend", () => {
  it("fills every requested month and buckets by transaction date", () => {
    const trend = monthlyTrend(rows, ["2026-07", "2026-08", "2026-09"]);
    expect(trend.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(trend[0].income.toFixed(2)).toBe("0.00");
    expect(trend[0].expense.toFixed(2)).toBe("0.00");
    expect(trend[1].expense.toFixed(2)).toBe("1000.00");
    expect(trend[1].income.toFixed(2)).toBe("5000.00");
    expect(trend[2].expense.toFixed(2)).toBe("1050.00");
    expect(trend[2].income.toFixed(2)).toBe("25000.00");
    expect(trend[2].net.toFixed(2)).toBe("23950.00");
  });

  it("accepts Date objects at UTC midnight", () => {
    const trend = monthlyTrend(
      [{ type: "EXPENSE", amount: "5", owner: "SELF", paymentMode: "CASH", transactionDate: new Date("2026-02-28T00:00:00.000Z") }],
      ["2026-02"],
    );
    expect(trend[0].expense.toFixed(2)).toBe("5.00");
  });
});

describe("ownerBreakdown", () => {
  it("separates Self and Brother totals", () => {
    const [self, bro] = ownerBreakdown(rows);
    expect(self.owner).toBe("SELF");
    expect(self.income.toFixed(2)).toBe("25000.00");
    expect(self.expense.toFixed(2)).toBe("1050.00");
    expect(bro.owner).toBe("BROTHER");
    expect(bro.income.toFixed(2)).toBe("5000.00");
    expect(bro.expense.toFixed(2)).toBe("1000.00");
    expect(bro.net.toFixed(2)).toBe("4000.00");
  });
});

describe("paymentModeBreakdown / cashVsOnline", () => {
  it("splits spending by payment mode", () => {
    const modes = paymentModeBreakdown(rows);
    expect(modes.map((m) => m.mode)).toEqual(["CARD", "UPI", "CASH"]);
    expect(modes.find((m) => m.mode === "CASH")!.total.toFixed(2)).toBe("350.00");
    expect(modes.find((m) => m.mode === "CASH")!.count).toBe(2);
  });

  it("cash vs online", () => {
    const { cash, online } = cashVsOnline(rows);
    expect(cash.toFixed(2)).toBe("350.00");
    expect(online.toFixed(2)).toBe("1700.00");
  });
});
