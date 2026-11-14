/**
 * Database-backed tests for the people ledger (GAVE / GOT) and quick add.
 *
 * Run with:  npm run test:integration   (needs TEST_DATABASE_URL, migrated)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, updateTransaction } from "@/lib/services/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getLedgerTotals, getPeopleLedger, getPersonLedger } from "@/lib/data/people";
import { AppError } from "@/lib/errors";
import { todayDateOnly } from "@/lib/dates";

const today = todayDateOnly();
const ids = { user: "", cash: "", bank: "", trading: "", raj: "", food: "" };
const base = { transactionDate: today, notes: "", paymentMode: "CASH", owner: "SELF" } as const;

async function balance(accountId: string): Promise<string> {
  const accounts = await getAccountsWithBalances(ids.user, { includeInactive: true });
  return accounts.find((a) => a.id === accountId)!.balance;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("people ledger (database)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Ledger Test", email: `ledger-test-${Date.now()}@example.com`, passwordHash: "x" },
    });
    ids.user = user.id;
    ids.cash = (await prisma.account.create({ data: { userId: user.id, name: "Cash", type: "CASH", openingBalance: "1000" } })).id;
    ids.bank = (await prisma.account.create({ data: { userId: user.id, name: "BOB", type: "BANK", openingBalance: "10000" } })).id;
    ids.trading = (await prisma.account.create({ data: { userId: user.id, name: "Angel One", type: "TRADING", openingBalance: "0" } })).id;
    ids.raj = (await prisma.person.create({ data: { userId: user.id, name: "Raj" } })).id;
    ids.food = (await prisma.category.create({ data: { userId: user.id, name: "Food", type: "EXPENSE" } })).id;
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

  it("GAVE from an account moves money and raises the person's balance", async () => {
    await createTransaction(ids.user, { ...base, type: "GAVE", amount: "500", personId: ids.raj, fromAccountId: ids.cash });
    expect(await balance(ids.cash)).toBe("500.00");
    const ledger = await getPersonLedger(ids.user, ids.raj);
    expect(ledger!.balance).toBe("500.00");
  });

  it("GOT without an account is only a record: no account balance moves", async () => {
    await createTransaction(ids.user, { ...base, type: "GOT", amount: "2000", personId: ids.raj, paymentMode: "OTHER", notes: "Paid my rent share" });
    expect(await balance(ids.cash)).toBe("500.00");
    expect(await balance(ids.bank)).toBe("10000.00");
    const ledger = await getPersonLedger(ids.user, ids.raj);
    expect(ledger!.balance).toBe("-1500.00");
    // Newest first, each with the balance right after it.
    expect(ledger!.entries.map((e) => e.runningBalance)).toEqual(["-1500.00", "500.00"]);
  });

  it("creates the person on the fly from a name", async () => {
    const { id } = await createTransaction(ids.user, { ...base, type: "GOT", amount: "300", personName: "Neha", toAccountId: ids.bank, paymentMode: "UPI" });
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id }, include: { person: true } });
    expect(t.person?.name).toBe("Neha");
    expect(await balance(ids.bank)).toBe("10300.00");
  });

  it("requires a person and never links a loan", async () => {
    await expect(createTransaction(ids.user, { ...base, type: "GAVE", amount: "10" })).rejects.toBeInstanceOf(AppError);
    await expect(createTransaction(ids.user, { ...base, type: "GAVE", amount: "10", personId: ids.raj, loanId: "x" })).rejects.toBeInstanceOf(AppError);
  });

  it("rejects a trading account as the source", async () => {
    await expect(
      createTransaction(ids.user, { ...base, type: "GAVE", amount: "10", personId: ids.raj, fromAccountId: ids.trading }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("counts legacy loans with the same person and stamps them with personId", async () => {
    const { loanId } = await createTransaction(ids.user, { ...base, type: "BORROW", amount: "1000", personId: ids.raj, toAccountId: ids.cash });
    await createTransaction(ids.user, { ...base, type: "LOAN_REPAYMENT", amount: "400", loanId: loanId!, fromAccountId: ids.cash });
    const stamped = await prisma.transaction.count({ where: { userId: ids.user, loanId: loanId!, personId: ids.raj } });
    expect(stamped).toBe(2);
    const ledger = await getPersonLedger(ids.user, ids.raj);
    // -1500 (before) - 1000 borrowed + 400 repaid
    expect(ledger!.balance).toBe("-2100.00");
    expect(ledger!.legacyLoanCount).toBe(1);
  });

  it("totals what you owe and what you are owed across people", async () => {
    const people = await getPeopleLedger(ids.user);
    expect(people.toPay).toBe("2400.00"); // Raj 2100 + Neha 300
    expect(people.toReceive).toBe("0.00");
    expect(people.peopleToPay).toBe(2);
    const totals = await getLedgerTotals(ids.user);
    expect(totals).toEqual({ toPay: "2400.00", toReceive: "0.00", net: "-2400.00" });
  });

  it("editing an entry changes the balance and keeps the person", async () => {
    const entry = await prisma.transaction.findFirstOrThrow({ where: { userId: ids.user, type: "GAVE", personId: ids.raj } });
    await updateTransaction(ids.user, entry.id, { ...base, type: "GAVE", amount: "800", personId: ids.raj, fromAccountId: ids.cash });
    const ledger = await getPersonLedger(ids.user, ids.raj);
    expect(ledger!.balance).toBe("-1800.00");
    // Turning it into an ordinary expense detaches the person.
    await updateTransaction(ids.user, entry.id, { ...base, type: "EXPENSE", amount: "800", fromAccountId: ids.cash, categoryId: ids.food });
    const after = await prisma.transaction.findUniqueOrThrow({ where: { id: entry.id } });
    expect(after.personId).toBeNull();
  });

  it("maps broker rows onto trading transactions", async () => {
    await createTransaction(ids.user, { ...base, type: "TRADING_DEPOSIT", amount: "5000", fromAccountId: ids.bank, toAccountId: ids.trading, paymentMode: "TRANSFER" });
    await createTransaction(ids.user, { ...base, type: "TRADING_PROFIT", amount: "1200", toAccountId: ids.trading, paymentMode: "TRANSFER" });
    await createTransaction(ids.user, { ...base, type: "TRADING_LOSS", amount: "45.60", fromAccountId: ids.trading, paymentMode: "TRANSFER", notes: "Charges" });
    expect(await balance(ids.trading)).toBe("6154.40");
  });
});
