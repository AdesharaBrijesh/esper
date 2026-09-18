import "server-only";
import { prisma } from "@/lib/prisma";
import type { ParseCsvResult, SkippedLine } from "@/lib/calculations/statement-csv";
import { suggestCategory, type MatchConfidence } from "@/lib/calculations/categorize";
import { toCategoryDTO } from "@/lib/serialize";
import { fromDateOnly, toDateOnly, type DateOnly } from "@/lib/dates";
import { moneyToString } from "@/lib/money";

export interface PreviewRow {
  /** Index into the returned rows array; how the client refers back to a row. */
  index: number;
  date: DateOnly;
  description: string;
  amount: string;
  direction: "debit" | "credit";
  suggestedCategoryId: string | null;
  confidence: MatchConfidence;
  possibleDuplicate: boolean;
}

export interface StatementPreview {
  rows: PreviewRow[];
  skipped: SkippedLine[];
}

const MAX_ROWS = 2000;

/**
 * Builds the review preview from already-parsed statement rows (CSV or PDF —
 * both parsers produce the same shape, see statement-csv.ts / statement-pdf.ts).
 * Suggests a category per row and flags likely duplicates against this account's
 * existing transactions.
 */
export async function previewStatement(
  userId: string,
  accountId: string,
  parseResult: ParseCsvResult,
): Promise<StatementPreview> {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!account) throw new Error("Account not found");

  const { rows: parsed, skipped } = parseResult;
  const rows = parsed.slice(0, MAX_ROWS);
  const overflow = parsed.length - rows.length;
  const allSkipped: SkippedLine[] = overflow > 0 ? [...skipped, { line: 0, reason: `${overflow} more row(s) were beyond the ${MAX_ROWS}-row import limit`, raw: "" }] : skipped;

  if (rows.length === 0) return { rows: [], skipped: allSkipped };

  const categories = (await prisma.category.findMany({ where: { userId } })).map(toCategoryDTO);

  const dates = rows.map((r) => r.date).sort();
  const [existingOut, existingIn] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        fromAccountId: accountId,
        transactionDate: { gte: fromDateOnly(dates[0]), lte: fromDateOnly(dates[dates.length - 1]) },
      },
      select: { transactionDate: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        toAccountId: accountId,
        transactionDate: { gte: fromDateOnly(dates[0]), lte: fromDateOnly(dates[dates.length - 1]) },
      },
      select: { transactionDate: true, amount: true },
    }),
  ]);
  const existingKey = (d: DateOnly, amount: string) => `${d}|${amount}`;
  const debitKeys = new Set(existingOut.map((t) => existingKey(toDateOnly(t.transactionDate), moneyToString(t.amount))));
  const creditKeys = new Set(existingIn.map((t) => existingKey(toDateOnly(t.transactionDate), moneyToString(t.amount))));

  const preview: PreviewRow[] = rows.map((row, index) => {
    const isExpense = row.direction === "debit";
    const suggestion = suggestCategory(row.description, isExpense, categories);
    const amount = row.amount.toFixed(2);
    const key = existingKey(row.date, amount);
    const possibleDuplicate = row.direction === "debit" ? debitKeys.has(key) : creditKeys.has(key);
    return {
      index,
      date: row.date,
      description: row.description,
      amount,
      direction: row.direction,
      suggestedCategoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      possibleDuplicate,
    };
  });

  return { rows: preview, skipped: allSkipped };
}
