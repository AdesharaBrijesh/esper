/**
 * Database-backed tests for the transaction service (create / update / delete)
 * including derived account balances and persisted loan balances.
 *
 * Run with:  npm run test:integration   (needs TEST_DATABASE_URL, migrated)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/services/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getLoanById, getLoanOverview } from "@/lib/data/loans";
import { AppError } from "@/lib/errors";
import { todayDateOnly } from "@/lib/dates";

const today = todayDateOnly();
const ids = {
  user: "",
  cash: "",
  bank: "",
  tradingSelf: "",
  tradingBro: "",
  archived: "",
  food: "",
  salary: "",
  tradingProfit: "",
};

async function balance(accountId: string): Promise<string> {
  const accounts = await getAccountsWithBalances(ids.user, { includeInactive: true });
  return accounts.find((a) => a.id === accountId)!.balance;
}

async function expectAppError(promise: Promise<unknown>, field?: string, pattern?: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the call to throw").toBeInstanceOf(AppError);
  const e = caught as AppError;
  if (field) {
    expect(e.fieldErrors, `expected a field error on ${field}, got: ${e.message}`).toBeDefined();
    expect(Object.keys(e.fieldErrors!)).toContain(field);
    if (pattern) expect(e.fieldErrors![field][0]).toMatch(pattern);
  } else if (pattern) {
    expect(e.message).toMatch(pattern);
  }
  return e;
}

const base = { transactionDate: today, notes: "", paymentMode: "CASH", owner: "SELF" } as const;

describe.skipIf(!process.env.TEST_DATABASE_URL)("transaction service (database)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Test", email: `svc-test-${Date.now()}@example.com`, passwordHash: "x" },
    });
    ids.user = user.id;
    const mk = (name: string, type: "CASH" | "BANK" | "TRADING", owner: "SELF" | "BROTHER", opening: string, isActive = true) =>
      prisma.account.create({ data: { userId: user.id, name, type, owner, openingBalance: opening, isActive } });
    ids.cash = (await mk("Cash", "CASH", "SELF", "1000")).id;
    ids.bank = (await mk("Bank", "BANK", "SELF", "20000")).id;
    ids.tradingSelf = (await mk("Self Trading", "TRADING", "SELF", "0")).id;
    ids.tradingBro = (await mk("Brother Trading", "TRADING", "BROTHER", "0")).id;
    ids.archived = (await mk("Old Wallet", "CASH", "SELF", "0", false)).id;
    const cat = (name: string, type: "EXPENSE" | "INCOME") => prisma.category.create({ data: { userId: user.id, name, type } });
    ids.food = (await cat("Food", "EXPENSE")).id;
    ids.salary = (await cat("Salary", "INCOME")).id;
    ids.tradingProfit = (await cat("Trading Profit", "INCOME")).id;
  });

  afterAll(async () => {
    if (!ids.user) return;
    await prisma.transaction.deleteMany({ where: { userId: ids.user } });
    await prisma.loan.deleteMany({ where: { userId: ids.user } });
    await prisma.person.deleteMany({ where: { userId: ids.user } });
    await prisma.account.deleteMany({ where: { userId: ids.user } });
    await prisma.category.deleteMany({ where: { userId: ids.user } });
    await prisma.user.delete({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it("starts from opening balances", async () => {
    expect(await balance(ids.cash)).toBe("1000.00");
    expect(await balance(ids.bank)).toBe("20000.00");
  });

  it("expense decreases the source account", async () => {
    await createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "250.50", fromAccountId: ids.cash, categoryId: ids.food });
    expect(await balance(ids.cash)).toBe("749.50");
  });

  it("income increases the destination account", async () => {
    await createTransaction(ids.user, { ...base, type: "INCOME", amount: "10000", toAccountId: ids.bank, categoryId: ids.salary, paymentMode: "BANK" });
    expect(await balance(ids.bank)).toBe("30000.00");
  });

  it("transfer moves money and keeps the total unchanged", async () => {
    const before = await getAccountsWithBalances(ids.user);
    const total = (list: { balance: string }[]) => list.reduce((s, a) => s + Number(a.balance), 0);
    await createTransaction(ids.user, { ...base, type: "TRANSFER", amount: "500", fromAccountId: ids.cash, toAccountId: ids.bank, paymentMode: "TRANSFER" });
    expect(await balance(ids.cash)).toBe("249.50");
    expect(await balance(ids.bank)).toBe("30500.00");
    const after = await getAccountsWithBalances(ids.user);
    expect(total(after).toFixed(2)).toBe(total(before).toFixed(2));
  });

  it("rejects invalid combinations", async () => {
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "TRANSFER", amount: "10", fromAccountId: ids.cash, toAccountId: ids.cash }),
      "toAccountId",
      /different/,
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "10", fromAccountId: ids.cash, categoryId: ids.salary }),
      "categoryId",
      /income category/,
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "10", fromAccountId: ids.archived, categoryId: ids.food }),
      "fromAccountId",
      /archived/,
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "-5", fromAccountId: ids.cash, categoryId: ids.food }),
      "amount",
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "10", fromAccountId: "nope", categoryId: ids.food }),
      "fromAccountId",
      /not found/,
    );
  });

  it("trading deposit needs a trading destination and a matching owner", async () => {
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "TRADING_DEPOSIT", amount: "100", fromAccountId: ids.bank, toAccountId: ids.cash }),
      "toAccountId",
      /not a trading account/,
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "TRADING_DEPOSIT", amount: "100", fromAccountId: ids.tradingSelf, toAccountId: ids.tradingBro }),
      "fromAccountId",
      /is a trading account/,
    );
    await expectAppError(
      createTransaction(ids.user, { ...base, type: "TRADING_DEPOSIT", amount: "100", fromAccountId: ids.bank, toAccountId: ids.tradingBro, owner: "SELF" }),
      "owner",
      /Brother/,
    );
  });

  it("trading deposit, profit, loss and withdrawal move the right balances", async () => {
    await createTransaction(ids.user, { ...base, type: "TRADING_DEPOSIT", amount: "20000", fromAccountId: ids.bank, toAccountId: ids.tradingSelf, paymentMode: "TRANSFER" });
    expect(await balance(ids.bank)).toBe("10500.00");
    expect(await balance(ids.tradingSelf)).toBe("20000.00");

    await createTransaction(ids.user, { ...base, type: "TRADING_PROFIT", amount: "3000", toAccountId: ids.tradingSelf, categoryId: ids.tradingProfit, paymentMode: "OTHER" });
    expect(await balance(ids.tradingSelf)).toBe("23000.00");

    await createTransaction(ids.user, { ...base, type: "TRADING_LOSS", amount: "2000", fromAccountId: ids.tradingSelf, paymentMode: "OTHER" });
    expect(await balance(ids.tradingSelf)).toBe("21000.00");

    await createTransaction(ids.user, { ...base, type: "TRADING_WITHDRAWAL", amount: "5000", fromAccountId: ids.tradingSelf, toAccountId: ids.bank, paymentMode: "TRANSFER" });
    expect(await balance(ids.tradingSelf)).toBe("16000.00");
    expect(await balance(ids.bank)).toBe("15500.00");

    // Brother's money stays separate
    await createTransaction(ids.user, { ...base, type: "TRADING_PROFIT", amount: "7500.50", toAccountId: ids.tradingBro, owner: "BROTHER", paymentMode: "OTHER" });
    expect(await balance(ids.tradingBro)).toBe("7500.50");
    expect(await balance(ids.tradingSelf)).toBe("16000.00");
  });

  describe("borrowing", () => {
    let borrowId = "";
    let loanId = "";
    let repaymentId = "";

    it("borrow creates a loan and increases cash", async () => {
      const cashBefore = await balance(ids.cash);
      const res = await createTransaction(ids.user, { ...base, type: "BORROW", amount: "5000", toAccountId: ids.cash, personName: "Rahul" });
      borrowId = res.id;
      loanId = res.loanId!;
      expect(loanId).toBeTruthy();
      const loan = await getLoanById(ids.user, loanId);
      expect(loan?.direction).toBe("BORROWED");
      expect(loan?.outstandingAmount).toBe("5000.00");
      expect(loan?.status).toBe("ACTIVE");
      expect(loan?.personName).toBe("Rahul");
      expect(Number(await balance(ids.cash))).toBeCloseTo(Number(cashBefore) + 5000, 2);
      // person reused case-insensitively
      const again = await createTransaction(ids.user, { ...base, type: "BORROW", amount: "1", toAccountId: ids.cash, personName: "rahul" });
      const loan2 = await getLoanById(ids.user, again.loanId!);
      expect(loan2?.personId).toBe(loan?.personId);
      await deleteTransaction(ids.user, again.id);
      expect(await getLoanById(ids.user, again.loanId!)).toBeNull();
    });

    it("partial repayment reduces outstanding and cash", async () => {
      const cashBefore = await balance(ids.cash);
      const res = await createTransaction(ids.user, { ...base, type: "LOAN_REPAYMENT", amount: "2000", fromAccountId: ids.cash, loanId });
      repaymentId = res.id;
      const loan = await getLoanById(ids.user, loanId);
      expect(loan?.outstandingAmount).toBe("3000.00");
      expect(loan?.status).toBe("ACTIVE");
      expect(Number(await balance(ids.cash))).toBeCloseTo(Number(cashBefore) - 2000, 2);
    });

    it("rejects repayments that exceed outstanding or use the wrong type", async () => {
      await expectAppError(
        createTransaction(ids.user, { ...base, type: "LOAN_REPAYMENT", amount: "3000.01", fromAccountId: ids.cash, loanId }),
        "amount",
        /cannot exceed/,
      );
      await expectAppError(
        createTransaction(ids.user, { ...base, type: "LENT_REPAYMENT", amount: "10", toAccountId: ids.cash, loanId }),
        "type",
      );
      await expectAppError(
        createTransaction(ids.user, { ...base, type: "LOAN_REPAYMENT", amount: "10", fromAccountId: ids.cash, loanId: "missing" }),
        "loanId",
      );
    });

    it("editing the repayment recomputes the loan; full repayment marks it paid", async () => {
      await updateTransaction(ids.user, repaymentId, { ...base, type: "LOAN_REPAYMENT", amount: "5000", fromAccountId: ids.cash, loanId });
      const loan = await getLoanById(ids.user, loanId);
      expect(loan?.outstandingAmount).toBe("0.00");
      expect(loan?.status).toBe("PAID");
      await expectAppError(
        createTransaction(ids.user, { ...base, type: "LOAN_REPAYMENT", amount: "1", fromAccountId: ids.cash, loanId }),
        "amount",
        /settled/,
      );
    });

    it("editing the borrow amount respects what was already repaid", async () => {
      await expectAppError(
        updateTransaction(ids.user, borrowId, { ...base, type: "BORROW", amount: "4999", toAccountId: ids.cash, personName: "Rahul" }),
        "amount",
        /already repaid/,
      );
      await updateTransaction(ids.user, borrowId, { ...base, type: "BORROW", amount: "8000", toAccountId: ids.cash, personName: "Rahul" });
      const loan = await getLoanById(ids.user, loanId);
      expect(loan?.originalAmount).toBe("8000.00");
      expect(loan?.outstandingAmount).toBe("3000.00");
      expect(loan?.status).toBe("ACTIVE");
    });

    it("cannot delete or retype the borrow while repayments exist", async () => {
      await expectAppError(deleteTransaction(ids.user, borrowId), undefined, /repayments/);
      await expectAppError(
        updateTransaction(ids.user, borrowId, { ...base, type: "INCOME", amount: "8000", toAccountId: ids.cash, categoryId: ids.salary }),
        undefined,
        /repayments/,
      );
    });

    it("deleting the repayment restores outstanding; deleting the borrow removes the loan", async () => {
      const cashBefore = await balance(ids.cash);
      await deleteTransaction(ids.user, repaymentId);
      expect((await getLoanById(ids.user, loanId))?.outstandingAmount).toBe("8000.00");
      expect(Number(await balance(ids.cash))).toBeCloseTo(Number(cashBefore) + 5000, 2);

      await deleteTransaction(ids.user, borrowId);
      expect(await getLoanById(ids.user, loanId)).toBeNull();
      expect(Number(await balance(ids.cash))).toBeCloseTo(Number(cashBefore) + 5000 - 8000, 2);
    });
  });

  describe("lending", () => {
    it("lend creates a LENT loan; repayment received reduces it; overview totals are right", async () => {
      const lend = await createTransaction(ids.user, { ...base, type: "LEND", amount: "3000", fromAccountId: ids.cash, personName: "Amit" });
      const borrow = await createTransaction(ids.user, { ...base, type: "BORROW", amount: "1200", toAccountId: ids.cash, personName: "Rahul" });
      await createTransaction(ids.user, { ...base, type: "LENT_REPAYMENT", amount: "1000", toAccountId: ids.cash, loanId: lend.loanId! });
      const loan = await getLoanById(ids.user, lend.loanId!);
      expect(loan?.direction).toBe("LENT");
      expect(loan?.outstandingAmount).toBe("2000.00");

      const overview = await getLoanOverview(ids.user);
      expect(overview.owedToYou).toBe("2000.00");
      expect(overview.youOwe).toBe("1200.00");
      expect(overview.net).toBe("800.00");
      expect(overview.owedToYouPeople.map((p) => p.personName)).toEqual(["Amit"]);
      expect(overview.youOwePeople.map((p) => p.personName)).toEqual(["Rahul"]);

      // converting the lend into a plain expense is only allowed without repayments
      await expectAppError(
        updateTransaction(ids.user, lend.id, { ...base, type: "EXPENSE", amount: "3000", fromAccountId: ids.cash, categoryId: ids.food }),
        undefined,
        /repayments/,
      );
      // but the borrow (no repayments) can be converted; its loan disappears
      await updateTransaction(ids.user, borrow.id, { ...base, type: "INCOME", amount: "1200", toAccountId: ids.cash, categoryId: ids.salary });
      expect(await getLoanById(ids.user, borrow.loanId!)).toBeNull();
      expect((await getLoanOverview(ids.user)).youOwe).toBe("0.00");
    });
  });

  it("changing a transaction type re-routes the money", async () => {
    const cashBefore = await balance(ids.cash);
    const bankBefore = await balance(ids.bank);
    const res = await createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "100", fromAccountId: ids.cash, categoryId: ids.food });
    expect(Number(await balance(ids.cash))).toBeCloseTo(Number(cashBefore) - 100, 2);
    await updateTransaction(ids.user, res.id, { ...base, type: "INCOME", amount: "100", toAccountId: ids.bank, categoryId: ids.salary });
    expect(await balance(ids.cash)).toBe(cashBefore);
    expect(Number(await balance(ids.bank))).toBeCloseTo(Number(bankBefore) + 100, 2);
    await deleteTransaction(ids.user, res.id);
    expect(await balance(ids.bank)).toBe(bankBefore);
  });

  it("never lets one user touch another user's records", async () => {
    const other = await prisma.user.create({ data: { name: "Other", email: `other-${Date.now()}@example.com`, passwordHash: "x" } });
    const otherCash = await prisma.account.create({ data: { userId: other.id, name: "Cash", type: "CASH", owner: "SELF", openingBalance: "0" } });
    try {
      await expectAppError(
        createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "10", fromAccountId: otherCash.id, categoryId: ids.food }),
        "fromAccountId",
        /not found/,
      );
      const mine = await createTransaction(ids.user, { ...base, type: "EXPENSE", amount: "10", fromAccountId: ids.cash, categoryId: ids.food });
      await expectAppError(deleteTransaction(other.id, mine.id), undefined, /not found/);
      await deleteTransaction(ids.user, mine.id);
    } finally {
      await prisma.account.delete({ where: { id: otherCash.id } });
      await prisma.user.delete({ where: { id: other.id } });
    }
  });
});
