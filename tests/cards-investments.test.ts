import { describe, expect, it } from "vitest";
import { cardSummary, nextDueDate, totalCardPosition } from "@/lib/calculations/cards";
import { investmentSummary, portfolioTotals } from "@/lib/calculations/investments";

describe("cardSummary", () => {
  it("reads a negative balance as the amount owed", () => {
    const summary = cardSummary({ balance: "-12500", creditLimit: "100000" });
    expect(summary.outstanding.toFixed(2)).toBe("12500.00");
    expect(summary.available?.toFixed(2)).toBe("87500.00");
    expect(summary.utilisation).toBe(13);
    expect(summary.level).toBe("healthy");
  });

  it("reports nothing owed on a card in credit, and keeps the overpayment visible", () => {
    const summary = cardSummary({ balance: "2000", creditLimit: "100000" });
    expect(summary.outstanding.toFixed(2)).toBe("0.00");
    expect(summary.creditBalance.toFixed(2)).toBe("2000.00");
    expect(summary.utilisation).toBe(0);
  });

  it("escalates the level as utilisation climbs", () => {
    expect(cardSummary({ balance: "-40000", creditLimit: "100000" }).level).toBe("warn");
    expect(cardSummary({ balance: "-80000", creditLimit: "100000" }).level).toBe("danger");
  });

  it("skips utilisation entirely when no limit is set", () => {
    const summary = cardSummary({ balance: "-5000" });
    expect(summary.outstanding.toFixed(2)).toBe("5000.00");
    expect(summary.limit).toBeNull();
    expect(summary.utilisation).toBeNull();
    expect(summary.level).toBe("none");
  });

  it("treats a zero limit as no limit rather than dividing by zero", () => {
    expect(cardSummary({ balance: "-100", creditLimit: "0" }).utilisation).toBeNull();
  });
});

describe("card nextDueDate", () => {
  it("uses this month when the day is still ahead", () => {
    expect(nextDueDate(20, "2026-09-12")).toBe("2026-09-20");
  });

  it("rolls to next month once the day has passed", () => {
    expect(nextDueDate(5, "2026-09-12")).toBe("2026-10-05");
  });

  it("counts the due day itself as still due", () => {
    expect(nextDueDate(12, "2026-09-12")).toBe("2026-09-12");
  });

  it("clamps a day the month does not have", () => {
    expect(nextDueDate(31, "2026-02-01")).toBe("2026-02-28");
  });

  it("returns null when no due day is configured", () => {
    expect(nextDueDate(null, "2026-09-12")).toBeNull();
    expect(nextDueDate(0, "2026-09-12")).toBeNull();
  });
});

describe("totalCardPosition", () => {
  it("adds several cards into one position", () => {
    const totals = totalCardPosition([
      { balance: "-10000", creditLimit: "50000" },
      { balance: "-5000", creditLimit: "50000" },
    ]);
    expect(totals.outstanding.toFixed(2)).toBe("15000.00");
    expect(totals.limit.toFixed(2)).toBe("100000.00");
    expect(totals.available.toFixed(2)).toBe("85000.00");
    expect(totals.utilisation).toBe(15);
  });

  it("ignores cards without a limit when computing utilisation", () => {
    const totals = totalCardPosition([{ balance: "-1000" }]);
    expect(totals.outstanding.toFixed(2)).toBe("1000.00");
    expect(totals.utilisation).toBeNull();
  });
});

describe("investmentSummary", () => {
  it("values a holding at cost until a valuation is recorded", () => {
    const summary = investmentSummary({ id: "a", balance: "50000" });
    expect(summary.currentValue.toFixed(2)).toBe("50000.00");
    expect(summary.gain.toFixed(2)).toBe("0.00");
    expect(summary.hasValuation).toBe(false);
  });

  it("derives the gain from the latest recorded value", () => {
    const summary = investmentSummary({ id: "a", balance: "50000", latestValue: "57500", latestValueAsOf: "2026-09-01" });
    expect(summary.gain.toFixed(2)).toBe("7500.00");
    expect(summary.returnPercent).toBe(15);
    expect(summary.valuedOn).toBe("2026-09-01");
  });

  it("handles a loss", () => {
    const summary = investmentSummary({ id: "a", balance: "50000", latestValue: "45000" });
    expect(summary.gain.toFixed(2)).toBe("-5000.00");
    expect(summary.returnPercent).toBe(-10);
  });

  it("does not compute a percentage when nothing has been invested", () => {
    expect(investmentSummary({ id: "a", balance: "0", latestValue: "0" }).returnPercent).toBeNull();
  });
});

describe("portfolioTotals", () => {
  it("adds holdings and flags when part of the total is only at cost", () => {
    const totals = portfolioTotals([
      { id: "a", balance: "50000", latestValue: "57500" },
      { id: "b", balance: "20000" },
    ]);
    expect(totals.invested.toFixed(2)).toBe("70000.00");
    expect(totals.currentValue.toFixed(2)).toBe("77500.00");
    expect(totals.gain.toFixed(2)).toBe("7500.00");
    expect(totals.partiallyValued).toBe(true);
  });

  it("is empty-safe", () => {
    const totals = portfolioTotals([]);
    expect(totals.currentValue.toFixed(2)).toBe("0.00");
    expect(totals.returnPercent).toBeNull();
  });
});
