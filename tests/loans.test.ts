import { describe, expect, it } from "vitest";
import {
  computeLoanOutstanding,
  loanStatusFor,
  summarizeLoans,
  summarizeLoansByPerson,
  validateOriginalAmountChange,
  validateRepaymentAmount,
} from "@/lib/calculations/loans";

describe("computeLoanOutstanding", () => {
  it("borrowing with no repayments leaves the full amount outstanding", () => {
    expect(computeLoanOutstanding("5000", []).toFixed(2)).toBe("5000.00");
    expect(loanStatusFor("5000")).toBe("ACTIVE");
  });

  it("partial repayment reduces outstanding", () => {
    const out = computeLoanOutstanding("5000", [{ amount: "2000" }]);
    expect(out.toFixed(2)).toBe("3000.00");
    expect(loanStatusFor(out)).toBe("ACTIVE");
  });

  it("multiple partial repayments accumulate", () => {
    const out = computeLoanOutstanding("5000", [{ amount: "2000" }, { amount: "1500.25" }, { amount: "499.75" }]);
    expect(out.toFixed(2)).toBe("1000.00");
  });

  it("full repayment marks the loan as paid", () => {
    const out = computeLoanOutstanding("3000", [{ amount: "1000" }, { amount: "2000" }]);
    expect(out.toFixed(2)).toBe("0.00");
    expect(loanStatusFor(out)).toBe("PAID");
  });

  it("lending works identically (direction is only a label)", () => {
    const out = computeLoanOutstanding("3000", [{ amount: "1000" }]);
    expect(out.toFixed(2)).toBe("2000.00");
  });
});

describe("validateRepaymentAmount", () => {
  it("accepts amounts up to the outstanding balance", () => {
    expect(validateRepaymentAmount("3000", "3000")).toBeNull();
    expect(validateRepaymentAmount("3000", "0.01")).toBeNull();
  });

  it("rejects zero/negative amounts", () => {
    expect(validateRepaymentAmount("3000", "0")).toMatch(/greater than 0/);
    expect(validateRepaymentAmount("3000", "-5")).toMatch(/greater than 0/);
  });

  it("rejects repayment exceeding outstanding", () => {
    expect(validateRepaymentAmount("3000", "3000.01")).toMatch(/cannot exceed/);
  });

  it("rejects repayment on a settled loan", () => {
    expect(validateRepaymentAmount("0", "10")).toMatch(/already fully settled/);
  });
});

describe("validateOriginalAmountChange", () => {
  it("allows increasing or decreasing above what was repaid", () => {
    expect(validateOriginalAmountChange("6000", "2000")).toBeNull();
    expect(validateOriginalAmountChange("2000", "2000")).toBeNull();
  });

  it("rejects amounts below what was already repaid", () => {
    expect(validateOriginalAmountChange("1999.99", "2000")).toMatch(/already repaid/);
  });

  it("rejects non-positive amounts", () => {
    expect(validateOriginalAmountChange("0", "0")).toMatch(/greater than 0/);
  });
});

describe("summarizeLoans", () => {
  it("splits totals by direction and ignores settled loans", () => {
    const totals = summarizeLoans([
      { direction: "BORROWED", outstandingAmount: "3000" },
      { direction: "BORROWED", outstandingAmount: "0" },
      { direction: "LENT", outstandingAmount: "5000" },
      { direction: "LENT", outstandingAmount: "1500.50" },
    ]);
    expect(totals.youOwe.toFixed(2)).toBe("3000.00");
    expect(totals.owedToYou.toFixed(2)).toBe("6500.50");
    expect(totals.net.toFixed(2)).toBe("3500.50");
  });

  it("groups by person", () => {
    const rows = summarizeLoansByPerson([
      { personId: "p1", personName: "Rahul", direction: "BORROWED", outstandingAmount: "3000" },
      { personId: "p2", personName: "Amit", direction: "LENT", outstandingAmount: "5000" },
      { personId: "p2", personName: "Amit", direction: "BORROWED", outstandingAmount: "1000" },
      { personId: "p2", personName: "Amit", direction: "LENT", outstandingAmount: "0" },
    ]);
    expect(rows.map((r) => r.personName)).toEqual(["Amit", "Rahul"]);
    const amit = rows[0];
    expect(amit.owedToYou.toFixed(2)).toBe("5000.00");
    expect(amit.youOwe.toFixed(2)).toBe("1000.00");
    expect(amit.net.toFixed(2)).toBe("4000.00");
    expect(amit.activeLoans).toBe(2);
    const rahul = rows[1];
    expect(rahul.youOwe.toFixed(2)).toBe("3000.00");
    expect(rahul.net.toFixed(2)).toBe("-3000.00");
  });
});
