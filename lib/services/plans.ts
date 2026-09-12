import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { fromDateOnly, toDateOnly, type DateOnly } from "@/lib/dates";
import { isPortfolioAccount, PLAN_TRANSACTION_TYPE, type PlanKind } from "@/lib/constants";
import { buildSchedule, installmentLabel, nextDueDate, scheduleToday } from "@/lib/calculations/plans";
import { MAX_INSTALLMENTS } from "@/lib/constants";
import type { PlanData } from "@/lib/validations/plan";

/**
 * Plans, instalments and the ledger.
 *
 * The rule that keeps everything honest: a plan on its own never moves money. Only a
 * *paid* instalment does, and it does so by creating a normal Transaction — the same
 * kind the rest of the app already understands. Balances, reports and CSV exports pick
 * it up for free, and un-paying an instalment deletes that transaction again.
 */

type Tx = Prisma.TransactionClient;

/** Instalment writes read-then-write, so they need the same isolation as transactions. */
const TX_OPTIONS = { isolationLevel: "Serializable" as const, maxWait: 5000, timeout: 15000 };

function fieldError(path: string, message: string): AppError {
  return new AppError(message, { [path]: [message] });
}

/** Validates the accounts and category a plan points at, in the same way transactions are checked. */
async function validatePlanTargets(tx: Tx, userId: string, data: PlanData): Promise<void> {
  if (data.fromAccountId) {
    const from = await tx.account.findFirst({
      where: { id: data.fromAccountId, userId },
      select: { id: true, name: true, type: true, isActive: true },
    });
    if (!from) throw fieldError("fromAccountId", "Account not found");
    if (!from.isActive) throw fieldError("fromAccountId", `${from.name} is archived`);
    if (isPortfolioAccount(from.type)) {
      throw fieldError("fromAccountId", `${from.name} is a portfolio account; pay from cash, bank, UPI or a card`);
    }
  }

  if (data.kind === "SIP") {
    const to = await tx.account.findFirst({
      where: { id: data.toAccountId!, userId },
      select: { id: true, name: true, type: true, isActive: true, owner: true },
    });
    if (!to) throw fieldError("toAccountId", "Account not found");
    if (!to.isActive) throw fieldError("toAccountId", `${to.name} is archived`);
    if (to.type !== "INVESTMENT") {
      throw fieldError("toAccountId", `${to.name} is not an investment account`);
    }
    if (to.owner !== data.owner) {
      throw fieldError("owner", `Owner must match ${to.name}`);
    }
  }

  if (data.categoryId) {
    const category = await tx.category.findFirst({
      where: { id: data.categoryId, userId },
      select: { id: true, type: true, name: true },
    });
    if (!category) throw fieldError("categoryId", "Category not found");
    if (category.type !== "EXPENSE") {
      throw fieldError("categoryId", `${category.name} is an income category`);
    }
  }
}

function planFields(data: PlanData) {
  return {
    kind: data.kind,
    name: data.name,
    provider: data.provider,
    amount: data.amount,
    frequency: data.frequency,
    startDate: fromDateOnly(data.startDate),
    endDate: data.endDate ? fromDateOnly(data.endDate) : null,
    totalCount: data.totalCount,
    owner: data.owner,
    paymentMode: data.paymentMode,
    categoryId: data.categoryId,
    fromAccountId: data.fromAccountId,
    toAccountId: data.kind === "SIP" ? data.toAccountId : null,
    remindDays: data.remindDays,
    status: data.status,
    notes: data.notes,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
/**
 * Creates a plan and its whole schedule at once.
 *
 * For a degree that started three years ago this generates every past term as well as
 * the future ones, which is what makes backfilling a single screen's work.
 */
export async function createPlan(userId: string, data: PlanData): Promise<{ id: string; installments: number }> {
  const today = scheduleToday();

  return prisma.$transaction(async (tx) => {
    await validatePlanTargets(tx, userId, data);

    const plan = await tx.plan.create({ data: { userId, ...planFields(data) }, select: { id: true } });

    const schedule = buildSchedule({
      frequency: data.frequency,
      startDate: data.startDate,
      amount: data.amount,
      totalCount: data.totalCount,
      endDate: data.endDate,
      today,
    });

    if (schedule.length > 0) {
      await tx.installment.createMany({
        data: schedule.map((row) => ({
          userId,
          planId: plan.id,
          sequence: row.sequence,
          label: row.label,
          dueDate: fromDateOnly(row.dueDate),
          amount: row.amount,
          status: "PENDING" as const,
        })),
      });
    }

    return { id: plan.id, installments: schedule.length };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
/**
 * Updates the plan template. Instalments already paid are left exactly as they are —
 * changing next year's fee must not silently rewrite what you actually paid last year.
 * Unpaid instalments are re-priced to the new amount.
 */
export async function updatePlan(userId: string, id: string, data: PlanData): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.plan.findFirst({
      where: { id, userId },
      select: { id: true, amount: true, frequency: true, startDate: true },
    });
    if (!existing) throw new NotFoundError("Plan");

    await validatePlanTargets(tx, userId, data);

    await tx.plan.update({ where: { id }, data: planFields(data) });

    const amountChanged = existing.amount.toString() !== data.amount;
    if (amountChanged) {
      await tx.installment.updateMany({
        where: { planId: id, userId, status: "PENDING" },
        data: { amount: data.amount },
      });
    }

    return { id };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Schedule maintenance
// ---------------------------------------------------------------------------
/** Adds `count` more instalments after the last one. Used to roll a subscription forward. */
export async function extendPlan(userId: string, planId: string, count: number): Promise<{ added: number }> {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({
      where: { id: planId, userId },
      select: { id: true, amount: true, frequency: true, startDate: true },
    });
    if (!plan) throw new NotFoundError("Plan");
    if (plan.frequency === "ONE_TIME") throw new AppError("A one-time plan has a single instalment.");

    const last = await tx.installment.findFirst({
      where: { planId, userId },
      orderBy: { sequence: "desc" },
      select: { sequence: true, dueDate: true },
    });

    const existingCount = await tx.installment.count({ where: { planId, userId } });
    if (existingCount + count > MAX_INSTALLMENTS) {
      throw new AppError(`A plan can hold at most ${MAX_INSTALLMENTS} instalments.`);
    }

    let sequence = last?.sequence ?? 0;
    let cursor: DateOnly = last ? toDateOnly(last.dueDate) : toDateOnly(plan.startDate);

    const rows = [];
    for (let i = 0; i < count; i++) {
      cursor = last || i > 0 ? nextDueDate(cursor, plan.frequency) : cursor;
      sequence += 1;
      rows.push({
        userId,
        planId,
        sequence,
        label: installmentLabel(plan.frequency, sequence, cursor),
        dueDate: fromDateOnly(cursor),
        amount: plan.amount.toString(),
        status: "PENDING" as const,
      });
    }

    await tx.installment.createMany({ data: rows });
    return { added: rows.length };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Paying instalments
// ---------------------------------------------------------------------------
interface PayOne {
  installmentId: string;
  paidDate: DateOnly;
  amount: string;
  fromAccountId: string;
  paymentMode?: string | null;
  notes?: string | null;
}

/** Builds the ledger transaction a paid instalment produces. */
function transactionDataFor(
  userId: string,
  plan: {
    kind: PlanKind;
    name: string;
    owner: "SELF" | "BROTHER";
    paymentMode: string;
    categoryId: string | null;
    toAccountId: string | null;
  },
  input: PayOne,
  label: string,
) {
  const type = PLAN_TRANSACTION_TYPE[plan.kind];
  return {
    userId,
    type,
    amount: input.amount,
    owner: plan.owner,
    paymentMode: (input.paymentMode ?? plan.paymentMode) as never,
    // A SIP is a transfer into the investment account; everything else is spending.
    categoryId: type === "TRANSFER" ? null : plan.categoryId,
    fromAccountId: input.fromAccountId,
    toAccountId: type === "TRANSFER" ? plan.toAccountId : null,
    transactionDate: fromDateOnly(input.paidDate),
    notes: input.notes ?? `${plan.name} — ${label}`,
  };
}

async function payOne(tx: Tx, userId: string, input: PayOne): Promise<string> {
  const installment = await tx.installment.findFirst({
    where: { id: input.installmentId, userId },
    select: {
      id: true,
      status: true,
      label: true,
      sequence: true,
      transactionId: true,
      plan: {
        select: {
          id: true,
          kind: true,
          name: true,
          owner: true,
          paymentMode: true,
          categoryId: true,
          toAccountId: true,
          frequency: true,
        },
      },
    },
  });
  if (!installment) throw new NotFoundError("Instalment");
  if (installment.status === "PAID") throw new AppError("That instalment is already paid.");

  const account = await tx.account.findFirst({
    where: { id: input.fromAccountId, userId },
    select: { id: true, name: true, type: true, isActive: true },
  });
  if (!account) throw fieldError("fromAccountId", "Account not found");
  if (!account.isActive) throw fieldError("fromAccountId", `${account.name} is archived`);
  if (isPortfolioAccount(account.type)) {
    throw fieldError("fromAccountId", `${account.name} is a portfolio account; pay from cash, bank, UPI or a card`);
  }

  const plan = installment.plan;
  if (plan.kind === "SIP" && !plan.toAccountId) {
    throw new AppError("This SIP has no investment account set. Edit the plan first.");
  }
  if (plan.kind !== "SIP" && !plan.categoryId) {
    throw new AppError("This plan has no category set. Edit the plan first.");
  }

  const label = installment.label ?? `#${installment.sequence}`;
  const created = await tx.transaction.create({
    data: transactionDataFor(userId, plan, input, label),
    select: { id: true },
  });

  await tx.installment.update({
    where: { id: installment.id },
    data: {
      status: "PAID",
      paidDate: fromDateOnly(input.paidDate),
      amount: input.amount,
      transactionId: created.id,
    },
  });

  return created.id;
}

/** Marks one instalment paid and writes the matching transaction. */
export async function payInstallment(userId: string, input: PayOne): Promise<{ transactionId: string }> {
  return prisma.$transaction(async (tx) => {
    const transactionId = await payOne(tx, userId, input);
    await syncPlanStatus(tx, userId, input.installmentId);
    return { transactionId };
  }, TX_OPTIONS);
}

/**
 * Marks many instalments paid in one go — the "I am entering three years of fees at
 * once" path. Each is dated on its own due date by default, so the history lands on the
 * right months in reports rather than all on today.
 */
export async function bulkPayInstallments(
  userId: string,
  args: { planId: string; installmentIds: string[]; fromAccountId: string; useDueDate: boolean; paidDate: DateOnly | null },
): Promise<{ paid: number }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.installment.findMany({
      where: { id: { in: args.installmentIds }, userId, planId: args.planId, status: { not: "PAID" } },
      select: { id: true, dueDate: true, amount: true },
      orderBy: { sequence: "asc" },
    });
    if (rows.length === 0) throw new AppError("Nothing to pay — those instalments are already settled.");

    for (const row of rows) {
      await payOne(tx, userId, {
        installmentId: row.id,
        paidDate: args.useDueDate ? toDateOnly(row.dueDate) : (args.paidDate ?? toDateOnly(row.dueDate)),
        amount: row.amount.toString(),
        fromAccountId: args.fromAccountId,
      });
    }

    await syncPlanStatus(tx, userId, rows[0].id);
    return { paid: rows.length };
  }, TX_OPTIONS);
}

/**
 * Reverses a payment: deletes the transaction it created and returns the instalment to
 * pending. This is the undo for a mistaken tap, and it leaves no orphan in the ledger.
 */
export async function unpayInstallment(userId: string, installmentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: { id: installmentId, userId },
      select: { id: true, status: true, transactionId: true, planId: true },
    });
    if (!installment) throw new NotFoundError("Instalment");
    if (installment.status !== "PAID") throw new AppError("That instalment is not marked paid.");

    // Clear the link first so deleting the transaction cannot cascade anywhere unexpected.
    await tx.installment.update({
      where: { id: installment.id },
      data: { status: "PENDING", paidDate: null, transactionId: null },
    });
    if (installment.transactionId) {
      await tx.transaction.deleteMany({ where: { id: installment.transactionId, userId } });
    }

    await syncPlanStatus(tx, userId, installment.id);
  }, TX_OPTIONS);
}

/** Marks an instalment as deliberately not owed (a waived term, a paused subscription). */
export async function skipInstallment(userId: string, installmentId: string, skip: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: { id: installmentId, userId },
      select: { id: true, status: true },
    });
    if (!installment) throw new NotFoundError("Instalment");
    if (installment.status === "PAID") {
      throw new AppError("That instalment is paid. Undo the payment first.");
    }
    await tx.installment.update({
      where: { id: installment.id },
      data: { status: skip ? "SKIPPED" : "PENDING" },
    });
    await syncPlanStatus(tx, userId, installment.id);
  }, TX_OPTIONS);
}

/** Edits one instalment's amount, due date or label (a fee revision, a rent increase). */
export async function updateInstallment(
  userId: string,
  args: { installmentId: string; amount: string; dueDate: DateOnly; label: string | null; notes: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const installment = await tx.installment.findFirst({
      where: { id: args.installmentId, userId },
      select: { id: true, status: true, transactionId: true },
    });
    if (!installment) throw new NotFoundError("Instalment");
    if (installment.status === "PAID") {
      throw new AppError("That instalment is paid. Undo the payment before editing it.");
    }
    await tx.installment.update({
      where: { id: installment.id },
      data: {
        amount: args.amount,
        dueDate: fromDateOnly(args.dueDate),
        label: args.label,
        notes: args.notes,
      },
    });
  }, TX_OPTIONS);
}

/**
 * A fixed-length plan with nothing left pending is finished. Recomputed after every
 * instalment change so the plans list does not need a nightly job to stay truthful.
 */
async function syncPlanStatus(tx: Tx, userId: string, installmentId: string): Promise<void> {
  const installment = await tx.installment.findFirst({
    where: { id: installmentId, userId },
    select: { planId: true },
  });
  if (!installment) return;

  const plan = await tx.plan.findFirst({
    where: { id: installment.planId, userId },
    select: { id: true, status: true, totalCount: true, endDate: true },
  });
  if (!plan || plan.status === "CANCELLED") return;

  const pending = await tx.installment.count({
    where: { planId: plan.id, userId, status: "PENDING" },
  });

  // Only close plans that have a defined end; an open-ended subscription stays active.
  const isFixed = Boolean(plan.totalCount || plan.endDate);
  const nextStatus = isFixed && pending === 0 ? "COMPLETED" : "ACTIVE";
  if (nextStatus !== plan.status) {
    await tx.plan.update({ where: { id: plan.id }, data: { status: nextStatus } });
  }
}

/** Deletes a plan. Refuses while paid instalments still point at ledger transactions. */
export async function deletePlan(userId: string, planId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({ where: { id: planId, userId }, select: { id: true } });
    if (!plan) throw new NotFoundError("Plan");

    const paid = await tx.installment.count({ where: { planId, userId, status: "PAID" } });
    if (paid > 0) {
      throw new AppError(
        `This plan has ${paid} paid instalment${paid === 1 ? "" : "s"} in your history. Cancel it instead, or undo those payments first.`,
      );
    }
    await tx.plan.delete({ where: { id: planId } });
  }, TX_OPTIONS);
}

/** Cancels a plan and clears its unpaid schedule, keeping the paid history intact. */
export async function cancelPlan(userId: string, planId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({ where: { id: planId, userId }, select: { id: true } });
    if (!plan) throw new NotFoundError("Plan");
    await tx.installment.deleteMany({ where: { planId, userId, status: "PENDING" } });
    await tx.plan.update({ where: { id: planId }, data: { status: "CANCELLED" } });
  }, TX_OPTIONS);
}

/** Reactivates a cancelled plan. The schedule is rebuilt from the next unpaid position. */
export async function reactivatePlan(userId: string, planId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findFirst({
      where: { id: planId, userId },
      select: { id: true, status: true },
    });
    if (!plan) throw new NotFoundError("Plan");
    await tx.plan.update({ where: { id: planId }, data: { status: "ACTIVE" } });
  }, TX_OPTIONS);
}
