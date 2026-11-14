import { describe, expect, it } from "vitest";
import { normalizeAiBankRows, normalizeAiTradingRows } from "@/lib/calculations/ai-statement";
import { parseStatementCsv, parseStatementTable } from "@/lib/calculations/statement-csv";
import { cellToString, parseWorkbookStatement, workbookToText } from "@/lib/calculations/statement-xlsx";

describe("normalizeAiBankRows", () => {
  const today = "2026-11-14";

  it("keeps valid rows and the model's category guess", () => {
    const r = normalizeAiBankRows(
      [
        { date: "2026-11-02", description: "Swiggy", amount: 249.5, direction: "debit", category: "Food" },
        { date: "01/11/2026", description: "Salary", amount: "40,000.00", direction: "credit", category: "" },
      ],
      today,
    );
    expect(r.skipped).toHaveLength(0);
    expect(r.rows.map((x) => [x.date, x.amount.toFixed(2), x.direction])).toEqual([
      ["2026-11-02", "249.50", "debit"],
      ["2026-11-01", "40000.00", "credit"],
    ]);
    expect(r.categoryHints).toEqual(["Food", null]);
  });

  it("skips rows it cannot trust, with a reason", () => {
    const r = normalizeAiBankRows(
      [
        { date: "yesterday", description: "x", amount: 10, direction: "debit" },
        { date: "2026-11-01", description: "x", amount: 0, direction: "debit" },
        { date: "2026-11-01", description: "x", amount: 10, direction: "sideways" },
      ],
      today,
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/date/),
      expect.stringMatching(/amount/),
      expect.stringMatching(/in or out/),
    ]);
  });

  it("moves an impossible future date (screenshot without a year) back a year", () => {
    const r = normalizeAiBankRows([{ date: "2026-12-28", description: "Gift", amount: 500, direction: "debit" }], today);
    expect(r.rows[0].date).toBe("2025-12-28");
  });
});

describe("normalizeAiTradingRows", () => {
  it("accepts the five kinds and fills a missing description", () => {
    const r = normalizeAiTradingRows(
      [
        { date: "2026-10-01", kind: "profit", amount: 1200, description: "RELIANCE (Equity delivery)" },
        { date: "2026-10-01", kind: "charges", amount: 45.6, description: "" },
        { date: "2026-10-02", kind: "dividend", amount: 10, description: "x" },
      ],
      "2026-11-14",
    );
    expect(r.rows.map((x) => [x.kind, x.amount.toFixed(2), x.description])).toEqual([
      ["profit", "1200.00", "RELIANCE (Equity delivery)"],
      ["charges", "45.60", "Charges"],
    ]);
    expect(r.skipped[0].reason).toMatch(/Unknown entry kind/);
  });
});

describe("header detection", () => {
  it("finds the header below a bank's account-details preamble", () => {
    const csv = [
      "Bank of Baroda",
      "Account Name,MR X",
      "Account Number,XXXX1234",
      "",
      "Tran Date,Narration,Withdrawal Amount (INR),Deposit Amount (INR),Balance",
      "01/11/2026,UPI/SWIGGY,250.00,,4750.00",
      "02/11/2026,NEFT SALARY,,40000.00,44750.00",
    ].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(skipped).toHaveLength(0);
    expect(rows.map((r) => [r.date, r.direction, r.amount.toFixed(2)])).toEqual([
      ["2026-11-01", "debit", "250.00"],
      ["2026-11-02", "credit", "40000.00"],
    ]);
  });

  it("still reports a missing header", () => {
    const { rows, skipped } = parseStatementTable([["foo", "bar"], ["1", "2"]]);
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/header/i);
  });
});

describe("Excel statements", () => {
  it("turns cells into the strings a CSV would contain", () => {
    expect(cellToString(new Date(Date.UTC(2026, 10, 3)))).toBe("2026-11-03");
    expect(cellToString(1250.4999999)).toBe("1250.5");
    expect(cellToString(250)).toBe("250");
    expect(cellToString(null)).toBe("");
    expect(cellToString("  SWIGGY ")).toBe("SWIGGY");
  });

  it("parses the sheet that holds the transactions", () => {
    const sheets = [
      { name: "Summary", rows: [["Opening", "1000"], ["Closing", "2000"]] },
      {
        name: "Transactions",
        rows: [
          ["Date", "Description", "Debit", "Credit"],
          ["2026-11-01", "Chai", "20", ""],
          ["2026-11-02", "Refund", "", "99.5"],
        ],
      },
    ];
    const r = parseWorkbookStatement(sheets);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ direction: "credit", description: "Refund" });
    const text = workbookToText(sheets);
    expect(text).toContain("### Sheet: Transactions");
    expect(text).toContain("2026-11-01,Chai,20");
  });
});
