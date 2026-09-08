import { describe, expect, it } from "vitest";
import { formatINR, formatAmount, moneyToString, parseMoneyInput, sum, toDecimal } from "@/lib/money";
import {
  addDays,
  addMonths,
  formatDateOnly,
  formatMonthKey,
  fromDateOnly,
  isDateOnly,
  monthKeyOf,
  monthKeysBetween,
  presetRange,
  relativeDateLabel,
  toDateOnly,
  todayDateOnly,
} from "@/lib/dates";

describe("money", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatINR("12500")).toBe("₹12,500.00");
    expect(formatINR("1234567.5")).toBe("₹12,34,567.50");
    expect(formatINR("0")).toBe("₹0.00");
    expect(formatINR("-250")).toBe("-₹250.00");
    expect(formatINR("250", { signed: true })).toBe("+₹250.00");
    expect(formatINR("12500.75", { compact: true })).toBe("₹12,501");
    expect(formatAmount("1234567.891")).toBe("12,34,567.89");
  });

  it("parses user input", () => {
    expect(parseMoneyInput("1,250.50")?.toFixed(2)).toBe("1250.50");
    expect(parseMoneyInput("₹ 99")?.toFixed(2)).toBe("99.00");
    expect(parseMoneyInput("12.")?.toFixed(2)).toBe("12.00");
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1.234")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
  });

  it("sums exactly and serialises to fixed strings", () => {
    expect(sum(["0.1", "0.2", 0.3]).toFixed(2)).toBe("0.60");
    expect(moneyToString(toDecimal("5"))).toBe("5.00");
    expect(moneyToString(null)).toBe("0.00");
  });
});

describe("dates", () => {
  it("round-trips date-only strings through UTC dates", () => {
    const d = fromDateOnly("2026-09-08");
    expect(d.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(toDateOnly(d)).toBe("2026-09-08");
  });

  it("validates date-only strings strictly", () => {
    expect(isDateOnly("2026-09-08")).toBe(true);
    expect(isDateOnly("2026-02-30")).toBe(false);
    expect(isDateOnly("2026-9-8")).toBe(false);
    expect(isDateOnly("08/09/2026")).toBe(false);
  });

  it("adds days and months, clamping to month end", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });

  it("builds preset ranges relative to a given date", () => {
    const now = new Date(2026, 8, 8); // 8 Sep 2026 local
    expect(presetRange("this-month", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetRange("last-month", now)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(presetRange("last-3-months", now)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(presetRange("this-year", now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("month helpers", () => {
    expect(monthKeyOf("2026-09-08")).toBe("2026-09");
    expect(monthKeysBetween("2026-11-15", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(formatMonthKey("2026-09")).toMatch(/Sep/);
    expect(formatDateOnly("2026-09-08")).toMatch(/8 Sep\w* 2026/);
  });

  it("relative labels", () => {
    const now = new Date(2026, 8, 8, 15, 0, 0);
    expect(todayDateOnly(now)).toBe("2026-09-08");
    expect(relativeDateLabel("2026-09-08", now)).toBe("Today");
    expect(relativeDateLabel("2026-09-07", now)).toBe("Yesterday");
    expect(relativeDateLabel("2026-09-01", now)).toMatch(/Tue/);
  });
});
