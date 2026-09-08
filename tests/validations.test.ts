import { describe, expect, it } from "vitest";
import { transactionSchema } from "@/lib/validations/transaction";
import { accountSchema } from "@/lib/validations/account";
import { categorySchema } from "@/lib/validations/category";
import { parseTransactionFilters } from "@/lib/validations/filters";
import { changePasswordSchema, loginSchema } from "@/lib/validations/auth";

const base = {
  amount: "250",
  transactionDate: "2026-09-08",
  owner: "SELF",
  paymentMode: "CASH",
  notes: "",
};

function issuesFor(input: unknown): Record<string, string[]> {
  const r = transactionSchema.safeParse(input);
  if (r.success) return {};
  const out: Record<string, string[]> = {};
  for (const i of r.error.issues) (out[String(i.path[0] ?? "form")] ??= []).push(i.message);
  return out;
}

describe("transactionSchema", () => {
  it("accepts a valid expense and normalises the amount", () => {
    const r = transactionSchema.safeParse({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", amount: "1,250.5" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount).toBe("1250.50");
      expect(r.data.notes).toBeNull();
      expect(r.data.toAccountId).toBeNull();
    }
  });

  it("rejects negative and zero amounts", () => {
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", amount: "-10" }).amount).toBeDefined();
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", amount: "0" }).amount).toBeDefined();
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", amount: "abc" }).amount).toBeDefined();
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", amount: "1.234" }).amount).toBeDefined();
  });

  it("requires category and source account for expenses", () => {
    const issues = issuesFor({ ...base, type: "EXPENSE" });
    expect(issues.fromAccountId).toBeDefined();
    expect(issues.categoryId).toBeDefined();
  });

  it("requires a destination account for income and forbids a source account", () => {
    const issues = issuesFor({ ...base, type: "INCOME", fromAccountId: "cash", categoryId: "salary" });
    expect(issues.toAccountId).toBeDefined();
    expect(issues.fromAccountId).toBeDefined();
  });

  it("rejects transfers from and to the same account", () => {
    const issues = issuesFor({ ...base, type: "TRANSFER", fromAccountId: "cash", toAccountId: "cash" });
    expect(issues.toAccountId?.[0]).toMatch(/different/);
  });

  it("transfers do not accept a category", () => {
    const issues = issuesFor({ ...base, type: "TRANSFER", fromAccountId: "cash", toAccountId: "bank", categoryId: "food" });
    expect(issues.categoryId).toBeDefined();
  });

  it("trading deposit needs both accounts; profit needs only a destination", () => {
    expect(issuesFor({ ...base, type: "TRADING_DEPOSIT", fromAccountId: "bank" }).toAccountId).toBeDefined();
    expect(transactionSchema.safeParse({ ...base, type: "TRADING_PROFIT", toAccountId: "trading" }).success).toBe(true);
    expect(transactionSchema.safeParse({ ...base, type: "TRADING_LOSS", fromAccountId: "trading" }).success).toBe(true);
    expect(issuesFor({ ...base, type: "TRADING_LOSS", toAccountId: "trading" }).fromAccountId).toBeDefined();
  });

  it("borrow requires a person (id or new name)", () => {
    expect(issuesFor({ ...base, type: "BORROW", toAccountId: "cash" }).personId).toBeDefined();
    expect(transactionSchema.safeParse({ ...base, type: "BORROW", toAccountId: "cash", personName: "Rahul" }).success).toBe(true);
    expect(transactionSchema.safeParse({ ...base, type: "LEND", fromAccountId: "cash", personId: "p1" }).success).toBe(true);
  });

  it("repayments require a loan id", () => {
    expect(issuesFor({ ...base, type: "LOAN_REPAYMENT", fromAccountId: "cash" }).loanId).toBeDefined();
    expect(transactionSchema.safeParse({ ...base, type: "LENT_REPAYMENT", toAccountId: "cash", loanId: "l1" }).success).toBe(true);
  });

  it("non-loan types must not reference loans or people", () => {
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", loanId: "l1" }).loanId).toBeDefined();
  });

  it("rejects invalid dates and unknown types", () => {
    expect(issuesFor({ ...base, type: "EXPENSE", fromAccountId: "cash", categoryId: "food", transactionDate: "2026-02-30" }).transactionDate).toBeDefined();
    expect(issuesFor({ ...base, type: "REFUND", fromAccountId: "cash" }).type).toBeDefined();
  });
});

describe("accountSchema", () => {
  it("defaults opening balance to 0 and allows negative balances", () => {
    const r = accountSchema.safeParse({ name: "Card", type: "CARD", owner: "SELF", openingBalance: "" });
    expect(r.success && r.data.openingBalance).toBe("0.00");
    const neg = accountSchema.safeParse({ name: "Card", type: "CARD", owner: "SELF", openingBalance: "-1500" });
    expect(neg.success && neg.data.openingBalance).toBe("-1500.00");
  });

  it("requires a name and valid enums", () => {
    expect(accountSchema.safeParse({ name: " ", type: "CASH", owner: "SELF", openingBalance: "0" }).success).toBe(false);
    expect(accountSchema.safeParse({ name: "X", type: "WALLET", owner: "SELF", openingBalance: "0" }).success).toBe(false);
    expect(accountSchema.safeParse({ name: "X", type: "CASH", owner: "COUSIN", openingBalance: "0" }).success).toBe(false);
  });
});

describe("categorySchema", () => {
  it("validates colour format and blanks", () => {
    expect(categorySchema.safeParse({ name: "Food", type: "EXPENSE", icon: "🍔", color: "#f97316" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Food", type: "EXPENSE", icon: "", color: "" }).success).toBe(true);
    expect(categorySchema.safeParse({ name: "Food", type: "EXPENSE", color: "orange" }).success).toBe(false);
  });
});

describe("parseTransactionFilters", () => {
  it("drops invalid fields instead of failing", () => {
    const f = parseTransactionFilters({ from: "2026-09-01", to: "nope", type: "EXPENSE", owner: "ALIEN", page: "3" });
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBeUndefined();
    expect(f.type).toBe("EXPENSE");
    expect(f.owner).toBeUndefined();
    expect(f.page).toBe(3);
  });

  it("defaults page to 1 and handles arrays", () => {
    const f = parseTransactionFilters({ accountId: ["a1", "a2"], page: "0" });
    expect(f.accountId).toBe("a1");
    expect(f.page).toBe(1);
  });
});

describe("auth schemas", () => {
  it("normalises email", () => {
    const r = loginSchema.safeParse({ email: "  Admin@Example.com ", password: "x" });
    expect(r.success && r.data.email).toBe("admin@example.com");
  });

  it("requires matching passwords of at least 8 chars", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "a", newPassword: "short", confirmPassword: "short" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "a", newPassword: "longenough", confirmPassword: "different" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: "a", newPassword: "longenough", confirmPassword: "longenough" }).success).toBe(true);
  });
});
