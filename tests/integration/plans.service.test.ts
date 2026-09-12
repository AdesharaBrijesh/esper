/**
 * Database-backed tests for the plan service.
 *
 * The thing worth proving here is the contract the whole feature rests on: a plan does
 * not move money, a *paid instalment* does, and it does so by writing a real
 * transaction that the account balances then reflect. Undo has to put everything back.
 *
 * Run with:  npm run test:integration   (needs TEST_DATABASE_URL, migrated)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  bulkPayInstallments,
  cancelPlan,
  createPlan,
  deletePlan,
  extendPlan,
  payInstallment,
  skipInstallment,
  unpayInstallment,
} from "@/lib/services/plans";
import { deleteTransaction } from "@/lib/services/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getPlanById, getPlanTotals } from "@/lib/data/plans";
import { AppError } from "@/lib/errors";
import { todayDateOnly } from "@/lib/dates";
import type { PlanData } from "@/lib/validations/plan";

const ids = { user: "", bank: "", cash: "", invest: "", fees: "", entertainment: "" };

async function balance(accountId: string): Promise<string> {
  const accounts = await getAccountsWithBalances(ids.user, { includeInactive: true });
  return accounts.find((a) => a.id === accountId)!.balance;
}

async function expectAppError(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught, "expected the call to throw").toBeInstanceOf(AppError);
  expect((caught as AppError).message).toMatch(pattern);
}

/** A fee plan whose first four terms are already in the past. */
function feePlan(overrides: Partial<PlanData> = {}): PlanData {
  return {
    kind: "FEE",
    name: "B.Tech fees",
    provider: "Test University",
    amount: "45000.00",
    frequency: "HALF_YEARLY",
    startDate: "2023-07-01",
    endDate: null,
    totalCount: 8,
    owner: "SELF",
    paymentMode: "BANK",
    categoryId: ids.fees,
    fromAccountId: ids.bank,
    toAccountId: null,
    remindDays: 3,
    status: "ACTIVE",
    notes: null,
    ...overrides,
  } as PlanData;
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("plan service (database)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { name: "Plan Test", email: `plan-test-${Date.now()}@example.com`, passwordHash: "x" },
    });
    ids.user = user.id;
    const mk = (name: string, type: "BANK" | "CASH" | "INVESTMENT", opening: string) =>
      prisma.account.create({ data: { userId: user.id, name, type, owner: "SELF", openingBalance: opening } });
    ids.bank = (await mk("Bank", "BANK", "500000")).id;
    ids.cash = (await mk("Cash", "CASH", "10000")).id;
    ids.invest = (await mk("Index Fund", "INVESTMENT", "0")).id;
    const cat = (name: string, type: "EXPENSE" | "INCOME") =>
      prisma.category.create({ data: { userId: user.id, name, type } });
    ids.fees = (await cat("Education", "EXPENSE")).id;
    ids.entertainment = (await cat("Entertainment", "EXPENSE")).id;
  });

  afterAll(async () => {
    if (ids.user) await prisma.user.delete({ where: { id: ids.user } });
    await prisma.$disconnect();
  });

  it("generates the whole schedule, past terms included", async () => {
    const { id, installments } = await createPlan(ids.user, feePlan());
    expect(installments).toBe(8);

    const detail = await getPlanById(ids.user, id);
    expect(detail!.installments).toHaveLength(8);
    expect(detail!.installments[0].dueDate).toBe("2023-07-01");
    expect(detail!.installments[7].dueDate).toBe("2027-01-01");
    // Nothing has been paid, so no money has moved.
    expect(await balance(ids.bank)).toBe("500000.00");
  });

  it("creates a real transaction when an instalment is paid", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Paid-once plan" }));
    const detail = await getPlanById(ids.user, id);
    const first = detail!.installments[0];

    const { transactionId } = await payInstallment(ids.user, {
      installmentId: first.id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });

    const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    expect(txn).not.toBeNull();
    expect(txn!.type).toBe("EXPENSE");
    expect(txn!.categoryId).toBe(ids.fees);
    expect(txn!.fromAccountId).toBe(ids.bank);
    expect(txn!.amount.toString()).toBe("45000");
    // The balance moved by exactly the instalment.
    expect(await balance(ids.bank)).toBe("455000.00");

    const after = await getPlanById(ids.user, id);
    expect(after!.installments[0].status).toBe("PAID");
    expect(after!.installments[0].paidDate).toBe("2023-07-05");
    expect(after!.plan.progress.paidAmount).toBe("45000.00");
  });

  it("refuses to pay the same instalment twice", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Double-pay plan" }));
    const detail = await getPlanById(ids.user, id);
    const first = detail!.installments[0];
    await payInstallment(ids.user, {
      installmentId: first.id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });
    await expectAppError(
      payInstallment(ids.user, {
        installmentId: first.id,
        paidDate: "2023-07-06",
        amount: "45000.00",
        fromAccountId: ids.bank,
      }),
      /already paid/i,
    );
  });

  it("backfills past terms in one call, dating each on its own due date", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Backfill plan" }));
    const detail = await getPlanById(ids.user, id);
    const past = detail!.installments.filter((i) => i.dueDate < todayDateOnly());
    expect(past.length).toBeGreaterThan(1);

    const before = await balance(ids.bank);
    const { paid } = await bulkPayInstallments(ids.user, {
      planId: id,
      installmentIds: past.map((i) => i.id),
      fromAccountId: ids.bank,
      useDueDate: true,
      paidDate: null,
    });
    expect(paid).toBe(past.length);

    // One transaction per instalment, each dated on its own due date.
    const txns = await prisma.transaction.findMany({
      where: { userId: ids.user, notes: { contains: "Backfill plan" } },
      orderBy: { transactionDate: "asc" },
    });
    expect(txns).toHaveLength(past.length);
    expect(txns[0].transactionDate.toISOString().slice(0, 10)).toBe(past[0].dueDate);

    const expected = (Number(before) - past.length * 45000).toFixed(2);
    expect(await balance(ids.bank)).toBe(expected);
  });

  it("undoes a payment and removes the transaction it created", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Undo plan" }));
    const detail = await getPlanById(ids.user, id);
    const first = detail!.installments[0];
    const before = await balance(ids.bank);

    const { transactionId } = await payInstallment(ids.user, {
      installmentId: first.id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });
    await unpayInstallment(ids.user, first.id);

    expect(await prisma.transaction.findUnique({ where: { id: transactionId } })).toBeNull();
    expect(await balance(ids.bank)).toBe(before);
    const after = await getPlanById(ids.user, id);
    expect(after!.installments[0].status).toBe("PENDING");
    expect(after!.installments[0].transactionId).toBeNull();
  });

  it("returns the instalment to pending when its transaction is deleted from the ledger", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Ledger delete plan" }));
    const detail = await getPlanById(ids.user, id);
    const first = detail!.installments[0];
    const { transactionId } = await payInstallment(ids.user, {
      installmentId: first.id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });

    // Deleting from the Activity screen must not leave the plan claiming it was paid.
    await deleteTransaction(ids.user, transactionId);

    const after = await getPlanById(ids.user, id);
    expect(after!.installments[0].status).toBe("PENDING");
    expect(after!.installments[0].transactionId).toBeNull();
  });

  it("moves money into the investment account for a SIP instead of spending it", async () => {
    const { id } = await createPlan(
      ids.user,
      feePlan({
        kind: "SIP",
        name: "Index SIP",
        amount: "5000.00",
        frequency: "MONTHLY",
        startDate: "2026-01-01",
        totalCount: 3,
        categoryId: null,
        toAccountId: ids.invest,
      }),
    );
    const detail = await getPlanById(ids.user, id);
    const bankBefore = await balance(ids.bank);

    const { transactionId } = await payInstallment(ids.user, {
      installmentId: detail!.installments[0].id,
      paidDate: "2026-01-01",
      amount: "5000.00",
      fromAccountId: ids.bank,
    });

    const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    expect(txn!.type).toBe("TRANSFER");
    expect(txn!.toAccountId).toBe(ids.invest);
    expect(txn!.categoryId).toBeNull();

    // Net worth is unchanged: the money moved, it was not spent.
    expect(await balance(ids.bank)).toBe((Number(bankBefore) - 5000).toFixed(2));
    expect(await balance(ids.invest)).toBe("5000.00");
  });

  it("keeps a skipped instalment out of what is owed", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Skip plan", totalCount: 2 }));
    const detail = await getPlanById(ids.user, id);
    await skipInstallment(ids.user, detail!.installments[1].id, true);

    const after = await getPlanById(ids.user, id);
    expect(after!.plan.progress.skipped).toBe(1);
    expect(after!.plan.progress.remainingAmount).toBe("45000.00");
    expect(after!.plan.progress.totalAmount).toBe("45000.00");
  });

  it("re-prices unpaid instalments on edit but never rewrites paid history", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Repricing plan", totalCount: 3 }));
    const detail = await getPlanById(ids.user, id);
    await payInstallment(ids.user, {
      installmentId: detail!.installments[0].id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });

    const { updatePlan } = await import("@/lib/services/plans");
    await updatePlan(ids.user, id, feePlan({ name: "Repricing plan", totalCount: 3, amount: "50000.00" }));

    const after = await getPlanById(ids.user, id);
    expect(after!.installments[0].amount).toBe("45000.00");
    expect(after!.installments[1].amount).toBe("50000.00");
  });

  it("marks a fixed-length plan completed once nothing is pending", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Completion plan", totalCount: 2 }));
    const detail = await getPlanById(ids.user, id);
    for (const installment of detail!.installments) {
      await payInstallment(ids.user, {
        installmentId: installment.id,
        paidDate: installment.dueDate,
        amount: installment.amount,
        fromAccountId: ids.bank,
      });
    }
    const after = await getPlanById(ids.user, id);
    expect(after!.plan.status).toBe("COMPLETED");
  });

  it("extends an open-ended plan without duplicating a due date", async () => {
    const { id, installments } = await createPlan(
      ids.user,
      feePlan({
        kind: "SUBSCRIPTION",
        name: "Streaming",
        amount: "649.00",
        frequency: "MONTHLY",
        startDate: "2026-01-05",
        totalCount: null,
        categoryId: ids.entertainment,
      }),
    );
    const { added } = await extendPlan(ids.user, id, 3);
    expect(added).toBe(3);

    const after = await getPlanById(ids.user, id);
    expect(after!.installments).toHaveLength(installments + 3);
    const dates = after!.installments.map((i) => i.dueDate);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("refuses to delete a plan with paid history, but allows cancelling it", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Protected plan", totalCount: 2 }));
    const detail = await getPlanById(ids.user, id);
    await payInstallment(ids.user, {
      installmentId: detail!.installments[0].id,
      paidDate: "2023-07-05",
      amount: "45000.00",
      fromAccountId: ids.bank,
    });

    await expectAppError(deletePlan(ids.user, id), /paid instalment/i);

    await cancelPlan(ids.user, id);
    const after = await getPlanById(ids.user, id);
    expect(after!.plan.status).toBe("CANCELLED");
    // The paid instalment survives; only the unpaid schedule is cleared.
    expect(after!.installments).toHaveLength(1);
    expect(after!.installments[0].status).toBe("PAID");
  });

  it("will not pay an instalment from a portfolio account", async () => {
    const { id } = await createPlan(ids.user, feePlan({ name: "Bad source plan", totalCount: 1 }));
    const detail = await getPlanById(ids.user, id);
    await expectAppError(
      payInstallment(ids.user, {
        installmentId: detail!.installments[0].id,
        paidDate: "2023-07-05",
        amount: "45000.00",
        fromAccountId: ids.invest,
      }),
      /portfolio account/i,
    );
  });

  it("keeps another user's instalments out of reach", async () => {
    const other = await prisma.user.create({
      data: { name: "Other", email: `plan-other-${Date.now()}@example.com`, passwordHash: "x" },
    });
    const { id } = await createPlan(ids.user, feePlan({ name: "Private plan", totalCount: 1 }));
    const detail = await getPlanById(ids.user, id);

    await expectAppError(
      payInstallment(other.id, {
        installmentId: detail!.installments[0].id,
        paidDate: "2023-07-05",
        amount: "45000.00",
        fromAccountId: ids.bank,
      }),
      /not found/i,
    );
    expect(await getPlanById(other.id, id)).toBeNull();

    await prisma.user.delete({ where: { id: other.id } });
  });

  it("totals the monthly commitment across active plans", async () => {
    const totals = await getPlanTotals(ids.user, "ALL");
    expect(Number(totals.monthlyCommitment)).toBeGreaterThan(0);
    expect(totals.activePlans).toBeGreaterThan(0);
  });
});
