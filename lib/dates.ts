/**
 * Transaction dates are stored as DATE (day precision) and travel as "YYYY-MM-DD" strings.
 * Prisma returns DATE columns as JS Dates at UTC midnight, so we always use UTC getters.
 */
export type DateOnly = string; // "YYYY-MM-DD"

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string" || !DATE_ONLY_RE.test(value)) return false;
  const d = fromDateOnly(value);
  return !Number.isNaN(d.getTime()) && toDateOnly(d) === value;
}

/** "YYYY-MM-DD" -> Date at UTC midnight (what Prisma expects for @db.Date). */
export function fromDateOnly(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date -> "YYYY-MM-DD" using UTC fields (correct for @db.Date values). */
export function toDateOnly(date: Date): DateOnly {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Current date in the local timezone as "YYYY-MM-DD". */
export function todayDateOnly(now: Date = new Date()): DateOnly {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfMonthDateOnly(now: Date = new Date()): DateOnly {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function endOfMonthDateOnly(now: Date = new Date()): DateOnly {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return todayDateOnly(last);
}

export function addMonths(dateOnly: DateOnly, months: number): DateOnly {
  const d = fromDateOnly(dateOnly);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toDateOnly(target);
}

export function addDays(dateOnly: DateOnly, days: number): DateOnly {
  const d = fromDateOnly(dateOnly);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

/** Inclusive date range as [from, to] "YYYY-MM-DD". */
export interface DateRange {
  from: DateOnly;
  to: DateOnly;
}

export type RangePreset = "this-month" | "last-month" | "last-3-months" | "this-year" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this-month":
      return { from: startOfMonthDateOnly(now), to: endOfMonthDateOnly(now) };
    case "last-month": {
      const lm = new Date(y, m - 1, 1);
      return { from: startOfMonthDateOnly(lm), to: endOfMonthDateOnly(lm) };
    }
    case "last-3-months": {
      const start = new Date(y, m - 2, 1);
      return { from: startOfMonthDateOnly(start), to: endOfMonthDateOnly(now) };
    }
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: startOfMonthDateOnly(now), to: endOfMonthDateOnly(now) };
  }
}

/** "2026-09-08" -> "8 Sept 2026" */
export function formatDateOnly(
  value: DateOnly | Date,
  opts?: { withYear?: boolean; weekday?: boolean },
): string {
  const d = typeof value === "string" ? fromDateOnly(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: opts?.withYear === false ? undefined : "numeric",
    weekday: opts?.weekday ? "short" : undefined,
    timeZone: "UTC",
  }).format(d);
}

/** "2026-09" -> "Sept 2026" */
export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "YYYY-MM" key for grouping. */
export function monthKeyOf(value: DateOnly | Date): string {
  const s = typeof value === "string" ? value : toDateOnly(value);
  return s.slice(0, 7);
}

/** All "YYYY-MM" keys between two dates, inclusive. */
export function monthKeysBetween(from: DateOnly, to: DateOnly): string[] {
  const keys: string[] = [];
  let cursor = `${from.slice(0, 7)}-01`;
  const end = `${to.slice(0, 7)}-01`;
  while (cursor <= end) {
    keys.push(cursor.slice(0, 7));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

/** Relative label for lists: Today / Yesterday / formatted date. */
export function relativeDateLabel(value: DateOnly, now: Date = new Date()): string {
  const today = todayDateOnly(now);
  if (value === today) return "Today";
  if (value === addDays(today, -1)) return "Yesterday";
  return formatDateOnly(value, {
    withYear: value.slice(0, 4) !== today.slice(0, 4),
    weekday: true,
  });
}
