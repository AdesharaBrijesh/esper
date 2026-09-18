/**
 * Pure CSV parsing for bank statement imports. No filesystem/DB access, so it's
 * fully unit-testable and reusable from both the server action and tests.
 *
 * Bank CSV exports vary a lot in column naming and date format; this is deliberately
 * forgiving rather than strict, and reports what it couldn't understand instead of
 * silently dropping rows or guessing wrong on money.
 */
import { toDecimal, type Decimal } from "@/lib/money";
import { isDateOnly, type DateOnly } from "@/lib/dates";

export interface RawStatementRow {
  /** 1-based line number in the source file, for error messages. */
  line: number;
  date: DateOnly;
  description: string;
  amount: Decimal;
  direction: "debit" | "credit";
}

export interface SkippedLine {
  line: number;
  reason: string;
  raw: string;
}

export interface ParseCsvResult {
  rows: RawStatementRow[];
  skipped: SkippedLine[];
}

/** RFC4180-ish CSV line splitter: handles quoted fields, escaped quotes, commas inside quotes. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "transaction date", "txn date", "value date", "posting date"],
  description: ["description", "narration", "particulars", "details", "remarks", "transaction details"],
  debit: ["debit", "withdrawal", "withdrawal amt", "debit amount", "dr"],
  credit: ["credit", "deposit", "deposit amt", "credit amount", "cr"],
  amount: ["amount", "transaction amount", "txn amount"],
  type: ["type", "transaction type", "dr/cr", "crdr"],
};

function matchHeader(header: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key];
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()));
}

/** Tries DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY. Indian bank statements default to day-first. */
export function parseStatementDate(raw: string): DateOnly | null {
  // `DateOnly` is a plain string alias, so narrowing `s` through the isDateOnly()
  // predicate would make TS treat the "not a DateOnly" fall-through as `never`.
  // Keep a second, unnarrowed binding for everything after this first check.
  const trimmed = raw.trim();
  if (isDateOnly(trimmed)) return trimmed;
  const s: string = trimmed;

  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const candidate = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isDateOnly(candidate)) return candidate;
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const [, d, mo, y] = m;
    const candidate = `20${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (isDateOnly(candidate)) return candidate;
  }

  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s-]+(\d{4})$/);
  if (m) {
    const [, d, monRaw, y] = m;
    const mo = monthNames[monRaw.slice(0, 3).toLowerCase()];
    if (mo) {
      const candidate = `${y}-${mo}-${d.padStart(2, "0")}`;
      if (isDateOnly(candidate)) return candidate;
    }
  }

  return null;
}

export function parseAmount(raw: string): Decimal | null {
  const cleaned = raw.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-") return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const d = toDecimal(cleaned).abs();
  return d.isZero() ? null : d;
}

/**
 * Parses full CSV text into statement rows. Accepts either a Debit/Credit column
 * pair, or a single Amount column plus a Dr/Cr type column, or a signed Amount
 * column (negative = debit).
 */
export function parseStatementCsv(text: string): ParseCsvResult {
  const lines = splitLines(text).filter((l) => l.length > 0);
  const rows: RawStatementRow[] = [];
  const skipped: SkippedLine[] = [];
  if (lines.length === 0) return { rows, skipped };

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = matchHeader(header, "date");
  const descIdx = matchHeader(header, "description");
  const debitIdx = matchHeader(header, "debit");
  const creditIdx = matchHeader(header, "credit");
  const amountIdx = matchHeader(header, "amount");
  const typeIdx = matchHeader(header, "type");

  if (dateIdx === -1 || descIdx === -1 || (debitIdx === -1 && creditIdx === -1 && amountIdx === -1)) {
    skipped.push({
      line: 1,
      reason: "Couldn't find Date, Description and Debit/Credit (or Amount) columns in the header row",
      raw: lines[0],
    });
    return { rows, skipped };
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = parseCsvLine(raw);
    const lineNo = i + 1;

    const date = parseStatementDate(cols[dateIdx] ?? "");
    if (!date) {
      skipped.push({ line: lineNo, reason: "Unrecognised or missing date", raw });
      continue;
    }
    const description = (cols[descIdx] ?? "").trim();

    let amount: Decimal | null = null;
    let direction: "debit" | "credit" | null = null;

    if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = debitIdx !== -1 ? parseAmount(cols[debitIdx] ?? "") : null;
      const credit = creditIdx !== -1 ? parseAmount(cols[creditIdx] ?? "") : null;
      if (debit && credit) {
        skipped.push({ line: lineNo, reason: "Both debit and credit have values — ambiguous", raw });
        continue;
      }
      if (debit) {
        amount = debit;
        direction = "debit";
      } else if (credit) {
        amount = credit;
        direction = "credit";
      }
    } else if (amountIdx !== -1) {
      const rawAmount = (cols[amountIdx] ?? "").trim();
      const isNegative = rawAmount.startsWith("-") || rawAmount.startsWith("(");
      amount = parseAmount(rawAmount);
      if (amount) {
        if (typeIdx !== -1) {
          const t = (cols[typeIdx] ?? "").trim().toLowerCase();
          direction = t.startsWith("cr") || t === "credit" || t === "c" ? "credit" : "debit";
        } else {
          direction = isNegative ? "debit" : "credit";
        }
      }
    }

    if (!amount || !direction) {
      skipped.push({ line: lineNo, reason: "No usable amount found (looks like a summary/balance row)", raw });
      continue;
    }
    if (!description) {
      skipped.push({ line: lineNo, reason: "Missing description", raw });
      continue;
    }

    rows.push({ line: lineNo, date, description, amount, direction });
  }

  return { rows, skipped };
}
