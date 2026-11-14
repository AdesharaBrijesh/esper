/**
 * Validation and normalisation for what the AI extracts from statements.
 *
 * The model's output is treated as untrusted input: every row must have a real date, a
 * positive amount and a known direction/kind, or it is reported as skipped with a reason
 * — the same contract the CSV and PDF parsers follow, so the review screen and the
 * duplicate check downstream do not care where a row came from.
 */
import type { Decimal } from "@/lib/money";
import { addDays, type DateOnly } from "@/lib/dates";
import { parseAmount, parseStatementDate, type ParseCsvResult, type RawStatementRow, type SkippedLine } from "./statement-csv";

export interface AiBankRow {
  date?: unknown;
  description?: unknown;
  amount?: unknown;
  direction?: unknown;
  category?: unknown;
}

export interface AiTradingRow {
  date?: unknown;
  kind?: unknown;
  amount?: unknown;
  description?: unknown;
}

export const TRADING_KINDS = ["profit", "loss", "charges", "deposit", "withdrawal"] as const;
export type TradingKind = (typeof TRADING_KINDS)[number];

export interface RawTradingRow {
  line: number;
  date: DateOnly;
  kind: TradingKind;
  amount: Decimal;
  description: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/**
 * Screenshots often show "12 Oct" with no year, so the model has to assume one. A date
 * more than a day in the future can only be last year's.
 */
function normalizeDate(raw: unknown, today: DateOnly): DateOnly | null {
  const d = parseStatementDate(str(raw));
  if (!d) return null;
  if (d > addDays(today, 1)) {
    const lastYear = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    return parseStatementDate(lastYear);
  }
  return d;
}

function normalizeAmount(raw: unknown): Decimal | null {
  const s = typeof raw === "number" ? (Number.isFinite(raw) ? raw.toFixed(2) : "") : str(raw);
  return parseAmount(s);
}

function clip(s: string, max: number) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export interface NormalizedBankRows extends ParseCsvResult {
  /** Category name the model suggested, by row position in `rows`. */
  categoryHints: (string | null)[];
}

export function normalizeAiBankRows(raw: readonly AiBankRow[], today: DateOnly): NormalizedBankRows {
  const rows: RawStatementRow[] = [];
  const skipped: SkippedLine[] = [];
  const categoryHints: (string | null)[] = [];
  raw.forEach((r, i) => {
    const line = i + 1;
    const rawText = [str(r.date), str(r.description), str(r.amount), str(r.direction)].join(" | ");
    const date = normalizeDate(r.date, today);
    if (!date) return void skipped.push({ line, reason: "AI row without a readable date", raw: rawText });
    const amount = normalizeAmount(r.amount);
    if (!amount) return void skipped.push({ line, reason: "AI row without a usable amount", raw: rawText });
    const dir = str(r.direction).toLowerCase();
    const direction = dir === "debit" || dir === "dr" ? "debit" : dir === "credit" || dir === "cr" ? "credit" : null;
    if (!direction) return void skipped.push({ line, reason: "AI couldn't tell if money went in or out", raw: rawText });
    const description = clip(str(r.description), 200) || (direction === "debit" ? "Payment" : "Received");
    rows.push({ line, date, description, amount, direction });
    categoryHints.push(str(r.category) || null);
  });
  return { rows, skipped, categoryHints };
}

export function normalizeAiTradingRows(raw: readonly AiTradingRow[], today: DateOnly): { rows: RawTradingRow[]; skipped: SkippedLine[] } {
  const rows: RawTradingRow[] = [];
  const skipped: SkippedLine[] = [];
  raw.forEach((r, i) => {
    const line = i + 1;
    const rawText = [str(r.date), str(r.kind), str(r.amount), str(r.description)].join(" | ");
    const date = normalizeDate(r.date, today);
    if (!date) return void skipped.push({ line, reason: "AI row without a readable date", raw: rawText });
    const amount = normalizeAmount(r.amount);
    if (!amount) return void skipped.push({ line, reason: "AI row without a usable amount (zero P&L rows are skipped)", raw: rawText });
    const kind = str(r.kind).toLowerCase() as TradingKind;
    if (!TRADING_KINDS.includes(kind)) return void skipped.push({ line, reason: `Unknown entry kind "${str(r.kind)}"`, raw: rawText });
    const fallback = { profit: "Profit", loss: "Loss", charges: "Charges", deposit: "Funds added", withdrawal: "Funds withdrawn" }[kind];
    rows.push({ line, date, kind, amount, description: clip(str(r.description), 200) || fallback });
  });
  return { rows, skipped };
}
