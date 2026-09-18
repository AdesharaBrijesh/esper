import { describe, expect, it } from "vitest";
import { parseCsvLine, parseStatementCsv } from "@/lib/calculations/statement-csv";
import { suggestCategory } from "@/lib/calculations/categorize";
import type { CategoryDTO } from "@/lib/types";

describe("parseCsvLine", () => {
  it("splits plain comma-separated fields", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("handles quoted fields with commas and escaped quotes inside", () => {
    expect(parseCsvLine('a,"b, with comma","she said ""hi"""')).toEqual(["a", "b, with comma", 'she said "hi"']);
  });
  it("trims whitespace around fields", () => {
    expect(parseCsvLine(" a , b ,c")).toEqual(["a", "b", "c"]);
  });
});

describe("parseStatementCsv", () => {
  it("parses a Debit/Credit style statement with day-first dates", () => {
    const csv = [
      "Date,Narration,Debit,Credit",
      "01/09/2026,SWIGGY ORDER 12345,250.00,",
      "02/09/2026,SALARY CREDIT SEPT,,40000.00",
      "03-09-2026,UPI/rahul/transfer,500,",
    ].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(skipped).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: "2026-09-01", direction: "debit", description: "SWIGGY ORDER 12345" });
    expect(rows[0].amount.toFixed(2)).toBe("250.00");
    expect(rows[1]).toMatchObject({ date: "2026-09-02", direction: "credit" });
    expect(rows[2]).toMatchObject({ date: "2026-09-03", direction: "debit" });
  });

  it("parses a single signed Amount column (negative = debit)", () => {
    const csv = ["Date,Description,Amount", "01/09/2026,Coffee shop,-150.50", "02/09/2026,Refund,75"].join("\n");
    const { rows } = parseStatementCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].direction).toBe("debit");
    expect(rows[0].amount.toFixed(2)).toBe("150.50");
    expect(rows[1].direction).toBe("credit");
  });

  it("parses an Amount + Dr/Cr type column", () => {
    const csv = ["Date,Particulars,Amount,Type", "01/09/2026,ATM withdrawal,2000,DR", "02/09/2026,Interest,50,CR"].join(
      "\n",
    );
    const { rows } = parseStatementCsv(csv);
    expect(rows[0].direction).toBe("debit");
    expect(rows[1].direction).toBe("credit");
  });

  it("handles ISO and 'DD Mon YYYY' dates", () => {
    const csv = ["Date,Description,Debit,Credit", "2026-09-01,Test,100,", "5 Sep 2026,Test2,,200"].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(skipped).toHaveLength(0);
    expect(rows[0].date).toBe("2026-09-01");
    expect(rows[1].date).toBe("2026-09-05");
  });

  it("skips rows with no usable amount (balance/summary rows) without dropping the batch", () => {
    const csv = [
      "Date,Description,Debit,Credit",
      "01/09/2026,Opening Balance,,",
      "02/09/2026,Real expense,100,",
    ].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/no usable amount/i);
  });

  it("skips unparseable dates and reports why", () => {
    const csv = ["Date,Description,Debit,Credit", "not-a-date,Something,100,"].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(rows).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/date/i);
  });

  it("reports an unrecognised header instead of throwing", () => {
    const csv = ["Foo,Bar", "1,2"].join("\n");
    const { rows, skipped } = parseStatementCsv(csv);
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it("returns nothing for empty input", () => {
    expect(parseStatementCsv("")).toEqual({ rows: [], skipped: [] });
  });

  it("is tolerant of column name variants and case", () => {
    const csv = ["TRANSACTION DATE,Particulars,Withdrawal Amt,Deposit Amt", "01/09/2026,Test,50,"].join("\n");
    const { rows } = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
  });
});

describe("suggestCategory", () => {
  const categories: CategoryDTO[] = [
    { id: "c-food", name: "Food", type: "EXPENSE", icon: "🍔", color: null, isActive: true, sortOrder: 0 },
    { id: "c-travel", name: "Travel", type: "EXPENSE", icon: "🚌", color: null, isActive: true, sortOrder: 1 },
    { id: "c-misc", name: "Miscellaneous", type: "EXPENSE", icon: "📦", color: null, isActive: true, sortOrder: 2 },
    { id: "c-salary", name: "Salary", type: "INCOME", icon: "💼", color: null, isActive: true, sortOrder: 0 },
    { id: "c-other-income", name: "Other Income", type: "INCOME", icon: "➕", color: null, isActive: true, sortOrder: 1 },
    { id: "c-disabled-food", name: "Food", type: "EXPENSE", icon: null, color: null, isActive: false, sortOrder: 3 },
  ];

  it("matches a known merchant keyword to the user's category of the same name", () => {
    const s = suggestCategory("SWIGGY ORDER #12345", true, categories);
    expect(s).toEqual({ categoryId: "c-food", categoryName: "Food", confidence: "matched" });
  });

  it("is case-insensitive", () => {
    expect(suggestCategory("uber trip to airport", true, categories).categoryId).toBe("c-travel");
  });

  it("falls back to Miscellaneous/Other Income when nothing matches", () => {
    expect(suggestCategory("some random merchant xyz", true, categories)).toEqual({
      categoryId: "c-misc",
      categoryName: "Miscellaneous",
      confidence: "guessed",
    });
    expect(suggestCategory("some random merchant xyz", false, categories)).toEqual({
      categoryId: "c-other-income",
      categoryName: "Other Income",
      confidence: "guessed",
    });
  });

  it("matches salary keyword for income rows", () => {
    const s = suggestCategory("SALARY CREDIT SEPT 2026", false, categories);
    expect(s.categoryId).toBe("c-salary");
    expect(s.confidence).toBe("matched");
  });

  it("never matches a disabled category, and returns unmatched with no fallback available", () => {
    const noFallback: CategoryDTO[] = [
      { id: "c-food", name: "Food", type: "EXPENSE", icon: null, color: null, isActive: true, sortOrder: 0 },
    ];
    const s = suggestCategory("totally unrelated text", true, noFallback);
    expect(s).toEqual({ categoryId: null, categoryName: null, confidence: "unmatched" });
  });

  it("never suggests an income category for an expense row or vice versa", () => {
    const s = suggestCategory("swiggy", false, categories); // swiggy keyword only maps to expense "Food"
    expect(s.categoryId).not.toBe("c-food");
  });
});

describe("parseStatementPdfText", () => {
  it("parses lines with an explicit Dr/Cr marker", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const text = [
      "Statement of Account",
      "Date       Narration                Amount        Balance",
      "01/09/2026 SWIGGY ORDER 12345        250.00 Dr    4750.00",
      "02/09/2026 SALARY CREDIT SEPT      40000.00 Cr   44750.00",
    ].join("\n");
    const { rows, skipped } = parseStatementPdfText(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: "2026-09-01", direction: "debit" });
    expect(rows[0].amount.toFixed(2)).toBe("250.00");
    expect(rows[1]).toMatchObject({ date: "2026-09-02", direction: "credit" });
    expect(rows[1].amount.toFixed(2)).toBe("40000.00");
    expect(skipped).toHaveLength(0);
  });

  it("falls back to a running-balance delta when there's no Dr/Cr marker", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const text = [
      "01/09/2026 Opening balance carried forward 0.00 5000.00",
      "02/09/2026 UPI payment to merchant 300.00 4700.00",
      "03/09/2026 Interest credited 50.00 4750.00",
    ].join("\n");
    const { rows } = parseStatementPdfText(text);
    // Row 1 seeds previousBalance=5000 (no marker, only 1 token counts as balance so it's skipped as a row).
    // Row 2: balance 4700 < 5000 -> debit of 300.
    expect(rows.some((r) => r.direction === "debit" && r.amount.toFixed(2) === "300.00")).toBe(true);
    // Row 3: balance 4750 > 4700 -> credit of 50.
    expect(rows.some((r) => r.direction === "credit" && r.amount.toFixed(2) === "50.00")).toBe(true);
  });

  it("skips a dated line with no usable amount", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const { rows, skipped } = parseStatementPdfText("01/09/2026 Statement continues on next page");
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it("skips a single ambiguous amount with no marker and no known prior balance", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const { rows, skipped } = parseStatementPdfText("01/09/2026 Some transaction 250.00");
    expect(rows).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/couldn't tell debit from credit/i);
  });

  it("ignores non-transaction lines that don't start with a date", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const text = ["Page 1 of 3", "Generated on 05/09/2026 at 10:00", "Account Number: 1234567890"].join("\n");
    const { rows, skipped } = parseStatementPdfText(text);
    expect(rows).toHaveLength(0);
    // "Generated on 05/09/2026..." does NOT start with the date (has leading text), so it's not even considered a candidate line.
    expect(skipped).toHaveLength(0);
  });

  it("extracts a clean description with amounts and markers stripped out", async () => {
    const { parseStatementPdfText } = await import("@/lib/calculations/statement-pdf");
    const { rows } = parseStatementPdfText("01/09/2026 AMAZON PAY INDIA PVT LTD 999.00 Dr 10000.00");
    // Every money-like token is stripped, not just the matched transaction amount — a clean
    // description shouldn't carry the running balance either.
    expect(rows[0].description).toBe("AMAZON PAY INDIA PVT LTD");
  });
});
