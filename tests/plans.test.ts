import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  daysUntil,
  dueLabel,
  installmentLabel,
  installmentView,
  monthlyEquivalent,
  nextDueDate,
  planProgress,
} from "@/lib/calculations/plans";
import { MAX_INSTALLMENTS } from "@/lib/constants";

describe("nextDueDate", () => {
  it("steps a week forward for weekly plans", () => {
    expect(nextDueDate("2026-01-01", "WEEKLY")).toBe("2026-01-08");
  });

  it("steps whole months for the calendar frequencies", () => {
    expect(nextDueDate("2026-01-15", "MONTHLY")).toBe("2026-02-15");
    expect(nextDueDate("2026-01-15", "QUARTERLY")).toBe("2026-04-15");
    expect(nextDueDate("2026-01-15", "HALF_YEARLY")).toBe("2026-07-15");
    expect(nextDueDate("2026-01-15", "YEARLY")).toBe("2027-01-15");
  });

  it("clamps to the last day when the target month is shorter", () => {
    expect(nextDueDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
  });

  it("does not move a one-time plan", () => {
    expect(nextDueDate("2026-01-15", "ONE_TIME")).toBe("2026-01-15");
  });
});

describe("buildSchedule", () => {
  it("generates exactly the requested number of instalments", () => {
    const rows = buildSchedule({
      frequency: "HALF_YEARLY",
      startDate: "2023-07-01",
      amount: "45000",
      totalCount: 8,
      today: "2026-09-12",
    });
    expect(rows).toHaveLength(8);
    expect(rows[0].dueDate).toBe("2023-07-01");
    expect(rows[7].dueDate).toBe("2027-01-01");
    expect(rows.every((r) => r.amount === "45000.00")).toBe(true);
  });

  it("backfills past terms so a degree already underway can be entered at once", () => {
    const rows = buildSchedule({
      frequency: "HALF_YEARLY",
      startDate: "2023-07-01",
      amount: "45000",
      totalCount: 8,
      today: "2026-09-12",
    });
    const past = rows.filter((r) => r.dueDate < "2026-09-12");
    expect(past.length).toBe(7);
  });

  it("schedules a rolling year ahead when the plan is open-ended", () => {
    const rows = buildSchedule({
      frequency: "MONTHLY",
      startDate: "2026-01-10",
      amount: "649",
      today: "2026-01-10",
    });
    // Twelve months ahead of today, inclusive of the first.
    expect(rows.length).toBe(13);
    expect(rows[0].dueDate).toBe("2026-01-10");
  });

  it("stops at the end date", () => {
    const rows = buildSchedule({
      frequency: "MONTHLY",
      startDate: "2026-01-01",
      amount: "1000",
      endDate: "2026-03-01",
      today: "2026-01-01",
    });
    expect(rows.map((r) => r.dueDate)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("produces a single row for a one-time plan", () => {
    const rows = buildSchedule({ frequency: "ONE_TIME", startDate: "2026-05-01", amount: "2500" });
    expect(rows).toEqual([{ sequence: 1, dueDate: "2026-05-01", amount: "2500.00", label: "Payment" }]);
  });

  it("never exceeds the hard cap", () => {
    const rows = buildSchedule({
      frequency: "WEEKLY",
      startDate: "2020-01-01",
      amount: "100",
      totalCount: 5000,
      today: "2026-09-12",
    });
    expect(rows.length).toBeLessThanOrEqual(MAX_INSTALLMENTS);
  });
});

describe("installmentLabel", () => {
  it("names terms by sequence for multi-month frequencies", () => {
    expect(installmentLabel("HALF_YEARLY", 3, "2024-07-01")).toBe("Term 3");
    expect(installmentLabel("YEARLY", 2, "2025-01-01")).toBe("Year 2");
  });

  it("names monthly instalments by their month", () => {
    expect(installmentLabel("MONTHLY", 3, "2026-03-10")).toContain("2026");
  });
});

describe("installmentView", () => {
  const today = "2026-09-12";

  it("reports paid and skipped regardless of the date", () => {
    expect(installmentView("PAID", "2020-01-01", today)).toBe("PAID");
    expect(installmentView("SKIPPED", "2020-01-01", today)).toBe("SKIPPED");
  });

  it("flags a pending instalment whose date has passed", () => {
    expect(installmentView("PENDING", "2026-09-11", today)).toBe("OVERDUE");
  });

  it("flags one inside the reminder window", () => {
    expect(installmentView("PENDING", "2026-09-14", today, 3)).toBe("DUE_SOON");
    expect(installmentView("PENDING", "2026-09-12", today, 3)).toBe("DUE_SOON");
  });

  it("leaves anything further out as upcoming", () => {
    expect(installmentView("PENDING", "2026-09-20", today, 3)).toBe("UPCOMING");
  });
});

describe("daysUntil and dueLabel", () => {
  it("counts whole days in both directions", () => {
    expect(daysUntil("2026-09-15", "2026-09-12")).toBe(3);
    expect(daysUntil("2026-09-09", "2026-09-12")).toBe(-3);
  });

  it("reads naturally near today", () => {
    expect(dueLabel("2026-09-12", "2026-09-12")).toBe("Due today");
    expect(dueLabel("2026-09-13", "2026-09-12")).toBe("Due tomorrow");
    expect(dueLabel("2026-09-11", "2026-09-12")).toBe("1 day overdue");
    expect(dueLabel("2026-09-05", "2026-09-12")).toBe("7 days overdue");
  });
});

describe("planProgress", () => {
  const today = "2026-09-12";

  it("splits paid, pending and overdue by amount", () => {
    const progress = planProgress(
      [
        { amount: "45000", status: "PAID", dueDate: "2025-07-01" },
        { amount: "45000", status: "PAID", dueDate: "2026-01-01" },
        { amount: "45000", status: "PENDING", dueDate: "2026-07-01" },
        { amount: "45000", status: "PENDING", dueDate: "2027-01-01" },
      ],
      today,
    );
    expect(progress.paid).toBe(2);
    expect(progress.pending).toBe(2);
    expect(progress.overdue).toBe(1);
    expect(progress.paidAmount.toFixed(2)).toBe("90000.00");
    expect(progress.remainingAmount.toFixed(2)).toBe("90000.00");
    expect(progress.overdueAmount.toFixed(2)).toBe("45000.00");
    expect(progress.percentPaid).toBe(50);
  });

  it("excludes skipped instalments from the totals, since they are not owed", () => {
    const progress = planProgress(
      [
        { amount: "1000", status: "PAID", dueDate: "2026-01-01" },
        { amount: "1000", status: "SKIPPED", dueDate: "2026-02-01" },
      ],
      today,
    );
    expect(progress.skipped).toBe(1);
    expect(progress.totalAmount.toFixed(2)).toBe("1000.00");
    expect(progress.remainingAmount.toFixed(2)).toBe("0.00");
    expect(progress.percentPaid).toBe(100);
  });

  it("reports the earliest unpaid instalment as next due", () => {
    const progress = planProgress(
      [
        { amount: "500", status: "PENDING", dueDate: "2026-12-01" },
        { amount: "500", status: "PENDING", dueDate: "2026-10-01" },
      ],
      today,
    );
    expect(progress.nextDue?.dueDate).toBe("2026-10-01");
  });

  it("handles an empty schedule without dividing by zero", () => {
    const progress = planProgress([], today);
    expect(progress.percentPaid).toBe(0);
    expect(progress.nextDue).toBeNull();
  });
});

describe("monthlyEquivalent", () => {
  it("normalises every frequency to a per-month cost", () => {
    expect(monthlyEquivalent("600", "MONTHLY").toFixed(2)).toBe("600.00");
    expect(monthlyEquivalent("3000", "QUARTERLY").toFixed(2)).toBe("1000.00");
    expect(monthlyEquivalent("6000", "HALF_YEARLY").toFixed(2)).toBe("1000.00");
    expect(monthlyEquivalent("12000", "YEARLY").toFixed(2)).toBe("1000.00");
  });

  it("spreads weekly over 52 weeks a year, not 4 a month", () => {
    expect(monthlyEquivalent("100", "WEEKLY").toFixed(2)).toBe("433.33");
  });

  it("counts a one-time plan as no ongoing commitment", () => {
    expect(monthlyEquivalent("50000", "ONE_TIME").toFixed(2)).toBe("0.00");
  });
});
