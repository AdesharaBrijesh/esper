import Decimal from "decimal.js";

/**
 * Money helpers. All arithmetic goes through decimal.js; never use JS floats.
 * Values cross the server/client boundary as strings (e.g. "1250.00").
 */
export type MoneyInput = Decimal | string | number | { toString(): string };

export const ZERO = new Decimal(0);

export function toDecimal(value: MoneyInput | null | undefined): Decimal {
  if (value === null || value === undefined) return ZERO;
  if (value instanceof Decimal) return value;
  if (typeof value === "number") return new Decimal(value);
  return new Decimal(String(value));
}

/** Fixed 2-decimal string, safe to send to client components. */
export function moneyToString(value: MoneyInput | null | undefined): string {
  return toDecimal(value).toFixed(2);
}

export function sum(values: Iterable<MoneyInput>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(toDecimal(v));
  return total;
}

export function isPositiveMoney(value: MoneyInput): boolean {
  const d = toDecimal(value);
  return d.isFinite() && d.greaterThan(0);
}

/** Parses user input like "1,250.5" or "₹1,250" into a Decimal; returns null if invalid. */
export function parseMoneyInput(raw: string | number | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  try {
    const d = new Decimal(cleaned);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "₹12,500.00" with Indian digit grouping. Works on server and client. */
export function formatINR(
  value: MoneyInput | null | undefined,
  opts?: { compact?: boolean; signed?: boolean },
): string {
  const d = toDecimal(value);
  const num = Number(d.toFixed(2));
  const formatted = opts?.compact
    ? inrCompactFormatter.format(Math.abs(num))
    : inrFormatter.format(Math.abs(num));
  const negative = d.isNegative() && !d.isZero();
  if (negative) return `-${formatted}`;
  if (opts?.signed && d.greaterThan(0)) return `+${formatted}`;
  return formatted;
}

/** Plain number string with Indian grouping and no currency symbol, e.g. "12,500.00". */
export function formatAmount(value: MoneyInput | null | undefined): string {
  const d = toDecimal(value);
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(d.toFixed(2)));
}

export { Decimal };
