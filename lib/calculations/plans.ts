import { toDecimal, ZERO, type Decimal, type MoneyInput } from "@/lib/money";
import { addDays, addMonths, formatDateOnly, toDateOnly, type DateOnly } from "@/lib/dates";
import {
  MAX_INSTALLMENTS,
  OPEN_ENDED_MONTHS_AHEAD,
  PLAN_FREQUENCY_MONTHS,
  PLAN_TERM_NOUN,
  type InstallmentStatus,
  type InstallmentView,
  type PlanFrequency,
} from "@/lib/constants";

/**
 * Pure scheduling logic for recurring plans. No database, no dates-from-now unless
 * passed in — everything here is a function of its arguments so it can be tested.
 */

export interface ScheduleOptions {
  frequency: PlanFrequency;
  startDate: DateOnly;
  amount: MoneyInput;
  /** Fixed number of instalments (8 semesters, 24 EMIs). */
  totalCount?: number | null;
  /** Last date to schedule up to, inclusive. */
  endDate?: DateOnly | null;
  /** Reference "today" used to bound open-ended plans. */
  today?: DateOnly;
}

export interface ScheduledInstallment {
  sequence: number;
  dueDate: DateOnly;
  amount: string;
  label: string;
}

/** Steps one period forward from a date. */
export function nextDueDate(date: DateOnly, frequency: PlanFrequency): DateOnly {
  if (frequency === "WEEKLY") return addDays(date, 7);
  const months = PLAN_FREQUENCY_MONTHS[frequency];
  if (months <= 0) return date;
  return addMonths(date, months);
}

/** "Semester 3", "Mar 2026", "Week 5" — what one instalment is called in the UI. */
export function installmentLabel(frequency: PlanFrequency, sequence: number, dueDate: DateOnly): string {
  if (frequency === "ONE_TIME") return "Payment";
  if (frequency === "MONTHLY" || frequency === "WEEKLY") {
    return formatDateOnly(dueDate, { withYear: true });
  }
  return `${PLAN_TERM_NOUN[frequency]} ${sequence}`;
}

/**
 * Builds the full list of instalments for a plan.
 *
 * A fixed-length plan (fees, EMIs) generates exactly `totalCount` rows, which is what
 * makes "enter the last three years of college fees in one go" a single action. An
 * open-ended plan (a subscription) schedules a rolling year ahead and is topped up
 * later, so it never grows without bound.
 */
export function buildSchedule(opts: ScheduleOptions): ScheduledInstallment[] {
  const amount = toDecimal(opts.amount).toFixed(2);
  const rows: ScheduledInstallment[] = [];

  if (opts.frequency === "ONE_TIME") {
    return [{ sequence: 1, dueDate: opts.startDate, amount, label: "Payment" }];
  }

  const horizon =
    opts.endDate ??
    (opts.totalCount && opts.totalCount > 0
      ? null
      : addMonths(opts.today ?? opts.startDate, OPEN_ENDED_MONTHS_AHEAD));

  const limit =
    opts.totalCount && opts.totalCount > 0 ? Math.min(opts.totalCount, MAX_INSTALLMENTS) : MAX_INSTALLMENTS;

  let cursor = opts.startDate;
  for (let sequence = 1; sequence <= limit; sequence++) {
    if (horizon && cursor > horizon) break;
    rows.push({ sequence, dueDate: cursor, amount, label: installmentLabel(opts.frequency, sequence, cursor) });
    cursor = nextDueDate(cursor, opts.frequency);
  }
  return rows;
}

/**
 * How an instalment should read right now.
 *
 * Only PENDING rows change with the calendar: one whose due date has passed is overdue,
 * one inside the plan's reminder window is due soon.
 */
export function installmentView(
  status: InstallmentStatus,
  dueDate: DateOnly,
  today: DateOnly,
  remindDays = 3,
): InstallmentView {
  if (status === "PAID") return "PAID";
  if (status === "SKIPPED") return "SKIPPED";
  if (dueDate < today) return "OVERDUE";
  if (dueDate <= addDays(today, Math.max(0, remindDays))) return "DUE_SOON";
  return "UPCOMING";
}

/** Whole days from today to the due date; negative once overdue. */
export function daysUntil(dueDate: DateOnly, today: DateOnly): number {
  const a = Date.parse(`${dueDate}T00:00:00.000Z`);
  const b = Date.parse(`${today}T00:00:00.000Z`);
  return Math.round((a - b) / 86_400_000);
}

/** "in 5 days" / "today" / "3 days ago" */
export function dueLabel(dueDate: DateOnly, today: DateOnly): string {
  const days = daysUntil(dueDate, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days === -1) return "1 day overdue";
  if (days > 0) return `Due in ${days} days`;
  return `${Math.abs(days)} days overdue`;
}

export interface InstallmentLike {
  amount: MoneyInput;
  status: InstallmentStatus;
  dueDate: DateOnly;
}

export interface PlanProgress {
  total: number;
  paid: number;
  pending: number;
  skipped: number;
  overdue: number;
  dueSoon: number;
  totalAmount: Decimal;
  paidAmount: Decimal;
  /** Still to pay: pending only. Skipped instalments are deliberately excluded. */
  remainingAmount: Decimal;
  overdueAmount: Decimal;
  /** 0-100, by amount rather than by count, so uneven instalments read correctly. */
  percentPaid: number;
  nextDue: { dueDate: DateOnly; amount: string } | null;
}

/** Aggregates one plan's instalments into everything the UI shows about it. */
export function planProgress(
  installments: readonly InstallmentLike[],
  today: DateOnly,
  remindDays = 3,
): PlanProgress {
  let paid = 0;
  let pending = 0;
  let skipped = 0;
  let overdue = 0;
  let dueSoon = 0;
  let totalAmount = ZERO;
  let paidAmount = ZERO;
  let remainingAmount = ZERO;
  let overdueAmount = ZERO;
  let nextDue: { dueDate: DateOnly; amount: string } | null = null;

  for (const row of installments) {
    const amount = toDecimal(row.amount);
    // Skipped instalments are not owed and never were, so they stay out of the totals.
    if (row.status !== "SKIPPED") totalAmount = totalAmount.plus(amount);

    if (row.status === "PAID") {
      paid += 1;
      paidAmount = paidAmount.plus(amount);
      continue;
    }
    if (row.status === "SKIPPED") {
      skipped += 1;
      continue;
    }

    pending += 1;
    remainingAmount = remainingAmount.plus(amount);
    const view = installmentView(row.status, row.dueDate, today, remindDays);
    if (view === "OVERDUE") {
      overdue += 1;
      overdueAmount = overdueAmount.plus(amount);
    } else if (view === "DUE_SOON") {
      dueSoon += 1;
    }
    if (!nextDue || row.dueDate < nextDue.dueDate) {
      nextDue = { dueDate: row.dueDate, amount: amount.toFixed(2) };
    }
  }

  const percentPaid = totalAmount.greaterThan(0)
    ? Math.min(100, Math.round(paidAmount.dividedBy(totalAmount).times(100).toNumber()))
    : 0;

  return {
    total: installments.length,
    paid,
    pending,
    skipped,
    overdue,
    dueSoon,
    totalAmount,
    paidAmount,
    remainingAmount,
    overdueAmount,
    percentPaid,
    nextDue,
  };
}

/**
 * Monthly equivalent of one instalment, so plans on different frequencies can be
 * added up into a single "committed per month" figure.
 */
export function monthlyEquivalent(amount: MoneyInput, frequency: PlanFrequency): Decimal {
  const value = toDecimal(amount);
  switch (frequency) {
    case "WEEKLY":
      // 52 weeks / 12 months.
      return value.times(52).dividedBy(12);
    case "MONTHLY":
      return value;
    case "QUARTERLY":
      return value.dividedBy(3);
    case "HALF_YEARLY":
      return value.dividedBy(6);
    case "YEARLY":
      return value.dividedBy(12);
    case "ONE_TIME":
      return ZERO;
  }
}

/** Today's date in the app timezone, as the scheduling functions expect it. */
export function scheduleToday(now: Date = new Date()): DateOnly {
  return toDateOnly(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}
