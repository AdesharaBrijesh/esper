/**
 * Best-effort text-based parser for bank statement PDFs.
 *
 * PDFs have no machine-readable columns — this reads the plain text a real
 * (non-scanned) bank PDF extracts to, in reading order, and applies two
 * heuristics per line, in order of confidence:
 *
 *  1. An explicit "Dr"/"Cr" marker next to an amount (many Indian bank
 *     statement PDFs print exactly this, since they're generated from the
 *     same data as the CSV/Excel export).
 *  2. A running-balance comparison: if a line has no marker but does have a
 *     trailing balance figure, and the previous row's balance is known, the
 *     sign of the balance change tells us the direction unambiguously.
 *
 * When neither applies, the line is skipped rather than guessed — a wrong
 * guess on debit/credit is worse than a row the user has to add by hand.
 * Produces the exact same {rows, skipped} shape as the CSV parser, so
 * everything downstream (categorisation, duplicate detection, the review
 * screen, the confirm action) is shared code, not a PDF-specific path.
 */
import type { Decimal } from "@/lib/money";
import { parseAmount, parseStatementDate, type ParseCsvResult, type RawStatementRow, type SkippedLine } from "./statement-csv";

const LEADING_DATE = /^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s-]+[A-Za-z]{3,}[\s-]+\d{4})\b/;
const MONEY_TOKEN = /-?\(?[\d,]+\.\d{2}\)?/g;
const DR_MARKER = /\b(dr|debit)\b/i;
const CR_MARKER = /\b(cr|credit)\b/i;

interface MoneyToken {
  value: Decimal;
  index: number;
  raw: string;
}

function findMoneyTokens(text: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  let m: RegExpExecArray | null;
  MONEY_TOKEN.lastIndex = 0;
  while ((m = MONEY_TOKEN.exec(text))) {
    const value = parseAmount(m[0]);
    if (value) out.push({ value, index: m.index, raw: m[0] });
  }
  return out;
}

export function parseStatementPdfText(text: string): ParseCsvResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: RawStatementRow[] = [];
  const skipped: SkippedLine[] = [];
  let previousBalance: Decimal | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const dateMatch = line.match(LEADING_DATE);
    if (!dateMatch) continue; // most PDF lines are headers/footers/page numbers, not transactions — not every line is expected to match

    const date = parseStatementDate(dateMatch[1]);
    if (!date) continue;

    const rest = line.slice(dateMatch[0].length);
    const tokens = findMoneyTokens(rest);
    if (tokens.length === 0) {
      skipped.push({ line: lineNo, reason: "Found a date but no amount on this line", raw: line });
      continue;
    }

    const description = rest
      .replace(MONEY_TOKEN, " ")
      .replace(/\b(dr|cr|debit|credit)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Heuristic 1: an explicit Dr/Cr marker within ~12 characters of a money token.
    let amount: Decimal | null = null;
    let direction: "debit" | "credit" | null = null;
    for (const t of tokens) {
      const around = rest.slice(Math.max(0, t.index - 4), t.index + t.raw.length + 12);
      if (DR_MARKER.test(around)) {
        amount = t.value;
        direction = "debit";
        break;
      }
      if (CR_MARKER.test(around)) {
        amount = t.value;
        direction = "credit";
        break;
      }
    }

    // The last money token on the line is usually the running balance.
    const balanceCandidate = tokens[tokens.length - 1]?.value ?? null;

    // Heuristic 2: no marker, but a running-balance delta tells us the direction.
    if (!amount && tokens.length >= 2 && balanceCandidate && previousBalance) {
      const delta = balanceCandidate.minus(previousBalance);
      if (!delta.isZero()) {
        direction = delta.greaterThan(0) ? "credit" : "debit";
        amount = delta.abs();
      }
    }

    if (!amount || !direction) {
      skipped.push({
        line: lineNo,
        reason: "Couldn't tell debit from credit on this line (no Dr/Cr marker and no usable running balance) — a CSV export from your bank would parse more reliably",
        raw: line,
      });
      if (balanceCandidate) previousBalance = balanceCandidate;
      continue;
    }
    if (!description) {
      skipped.push({ line: lineNo, reason: "Missing description", raw: line });
      if (balanceCandidate) previousBalance = balanceCandidate;
      continue;
    }

    rows.push({ line: lineNo, date, description, amount, direction });
    if (balanceCandidate) previousBalance = balanceCandidate;
  }

  return { rows, skipped };
}

/** Extracts plain text from a PDF buffer (genuine text PDFs only — not scanned/image PDFs). */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
