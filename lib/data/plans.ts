import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { moneyToString, toDecimal, ZERO } from "@/lib/money";
import { toDateOnly, type DateOnly } from "@/lib/dates";
import { installmentView, monthlyEquivalent, planProgress, scheduleToday } from "@/lib/calculations/plans";
import type { InstallmentDTO, PlanDTO } from "@/lib/types";
import type { OwnerFilter, PlanKind, PlanStatus } from "@/lib/constants";

/** Everything a plan card or detail page needs, in one query shape. */
const planInclude = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  fromAccount: { select: { id: true, name: true, type: true } },
  toAccount: { select: { id: true, name: true, type: true } },
  installments: { orderBy: { sequence: "asc" } },
} satisfies Prisma.PlanInclude;

type PlanRow = Prisma.PlanGetPayload<{ include: typeof planInclude }>;
type InstallmentRow = PlanRow["installments"][number];

function toInstallmentDTO(row: InstallmentRow, today: DateOnly, remindDays: number): InstallmentDTO {
  const dueDate = toDateOnly(row.dueDate);
  return {
    id: row.id,
    planId: row.planId,
    sequence: row.sequence,
    label: row.label,
    dueDate,
    amount: moneyToString(row.amount),
    status: row.status,
    paidDate: row.paidDate ? toDateOnly(row.paidDate) : null,
    transactionId: row.transactionId,
    notes: row.notes,
    view: installmentView(row.status, dueDate, today, remindDays),
  };
}

function toPlanDTO(row: PlanRow, today: DateOnly): PlanDTO {
  const progress = planProgress(
    row.installments.map((i) => ({ amount: i.amount, status: i.status, dueDate: toDateOnly(i.dueDate) })),
    today,
    row.remindDays,
  );

  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    provider: row.provider,
    amount: moneyToString(row.amount),
    frequency: row.frequency,
    startDate: toDateOnly(row.startDate),
    endDate: row.endDate ? toDateOnly(row.endDate) : null,
    totalCount: row.totalCount,
    owner: row.owner,
    paymentMode: row.paymentMode,
    categoryId: row.categoryId,
    category: row.category,
    fromAccountId: row.fromAccountId,
    fromAccount: row.fromAccount,
    toAccountId: row.toAccountId,
    toAccount: row.toAccount,
    remindDays: row.remindDays,
    status: row.status,
    notes: row.notes,
    progress: {
      total: progress.total,
      paid: progress.paid,
      pending: progress.pending,
      skipped: progress.skipped,
      overdue: progress.overdue,
      dueSoon: progress.dueSoon,
      totalAmount: moneyToString(progress.totalAmount),
      paidAmount: moneyToString(progress.paidAmount),
      remainingAmount: moneyToString(progress.remainingAmount),
      overdueAmount: moneyToString(progress.overdueAmount),
      percentPaid: progress.percentPaid,
      nextDue: progress.nextDue,
    },
    // Cancelled plans no longer cost anything per month.
    monthlyEquivalent: moneyToString(
      row.status === "ACTIVE" ? monthlyEquivalent(row.amount, row.frequency) : 0,
    ),
  };
}

export interface PlanFilters {
  kind?: PlanKind | "ALL";
  status?: PlanStatus | "ALL";
  owner?: OwnerFilter;
}

export async function getPlans(userId: string, filters: PlanFilters = {}): Promise<PlanDTO[]> {
  const today = scheduleToday();
  const rows = await prisma.plan.findMany({
    where: {
      userId,
      ...(filters.kind && filters.kind !== "ALL" ? { kind: filters.kind } : {}),
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(filters.owner && filters.owner !== "ALL" ? { owner: filters.owner } : {}),
    },
    include: planInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => toPlanDTO(row, today));
}

export interface PlanDetail {
  plan: PlanDTO;
  installments: InstallmentDTO[];
}

export async function getPlanById(userId: string, id: string): Promise<PlanDetail | null> {
  const today = scheduleToday();
  const row = await prisma.plan.findFirst({ where: { id, userId }, include: planInclude });
  if (!row) return null;
  return {
    plan: toPlanDTO(row, today),
    installments: row.installments.map((i) => toInstallmentDTO(i, today, row.remindDays)),
  };
}

export interface UpcomingInstallment extends InstallmentDTO {
  planName: string;
  planKind: PlanKind;
  planId: string;
  categoryIcon: string | null;
}

/**
 * Instalments that need attention: everything overdue, plus anything falling due
 * inside the window. This is what the dashboard surfaces, and it is the reason the
 * app can be trusted to remember a fee deadline.
 */
export async function getUpcomingInstallments(
  userId: string,
  opts: { daysAhead?: number; limit?: number; owner?: OwnerFilter } = {},
): Promise<UpcomingInstallment[]> {
  const today = scheduleToday();
  const daysAhead = opts.daysAhead ?? 30;
  const horizon = new Date(Date.parse(`${today}T00:00:00.000Z`) + daysAhead * 86_400_000);

  const rows = await prisma.installment.findMany({
    where: {
      userId,
      status: "PENDING",
      dueDate: { lte: horizon },
      plan: {
        status: "ACTIVE",
        ...(opts.owner && opts.owner !== "ALL" ? { owner: opts.owner } : {}),
      },
    },
    orderBy: { dueDate: "asc" },
    take: opts.limit ?? 20,
    include: {
      plan: { select: { id: true, name: true, kind: true, remindDays: true, category: { select: { icon: true } } } },
    },
  });

  return rows.map((row) => ({
    ...toInstallmentDTO(row, today, row.plan.remindDays),
    planId: row.plan.id,
    planName: row.plan.name,
    planKind: row.plan.kind,
    categoryIcon: row.plan.category?.icon ?? null,
  }));
}

export interface PlanTotals {
  activePlans: number;
  monthlyCommitment: string;
  overdueCount: number;
  overdueAmount: string;
  dueSoonCount: number;
  dueSoonAmount: string;
  /** Everything still unpaid across every active plan — the full forward obligation. */
  outstandingAmount: string;
}

/** Headline numbers for the plans screen and the dashboard tile. */
export async function getPlanTotals(userId: string, owner: OwnerFilter = "ALL"): Promise<PlanTotals> {
  const today = scheduleToday();
  const plans = await prisma.plan.findMany({
    where: {
      userId,
      status: "ACTIVE",
      ...(owner !== "ALL" ? { owner } : {}),
    },
    select: {
      amount: true,
      frequency: true,
      remindDays: true,
      installments: { select: { amount: true, status: true, dueDate: true } },
    },
  });

  let overdueCount = 0;
  let dueSoonCount = 0;
  let monthlyTotal = ZERO;
  let overdueAmount = ZERO;
  let dueSoonAmount = ZERO;
  let outstanding = ZERO;

  for (const plan of plans) {
    monthlyTotal = monthlyTotal.plus(monthlyEquivalent(plan.amount, plan.frequency));
    const progress = planProgress(
      plan.installments.map((i) => ({ amount: i.amount, status: i.status, dueDate: toDateOnly(i.dueDate) })),
      today,
      plan.remindDays,
    );
    overdueCount += progress.overdue;
    dueSoonCount += progress.dueSoon;
    overdueAmount = overdueAmount.plus(progress.overdueAmount);
    outstanding = outstanding.plus(progress.remainingAmount);

    for (const row of plan.installments) {
      if (row.status !== "PENDING") continue;
      const view = installmentView(row.status, toDateOnly(row.dueDate), today, plan.remindDays);
      if (view === "DUE_SOON") dueSoonAmount = dueSoonAmount.plus(toDecimal(row.amount));
    }
  }

  return {
    activePlans: plans.length,
    monthlyCommitment: moneyToString(monthlyTotal),
    overdueCount,
    overdueAmount: moneyToString(overdueAmount),
    dueSoonCount,
    dueSoonAmount: moneyToString(dueSoonAmount),
    outstandingAmount: moneyToString(outstanding),
  };
}
