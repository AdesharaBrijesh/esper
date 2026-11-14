/**
 * Excel (.xlsx) statements: bank exports and broker reports (Angel One P&L, tradebook,
 * ledger) all download as spreadsheets. Every sheet becomes a plain string table so the
 * same header-detecting parser used for CSV handles it (see parseStatementTable), and
 * the same table can be handed to the AI as CSV text when no header is recognised.
 */
import type { ParseCsvResult } from "./statement-csv";
import { parseStatementTable } from "./statement-csv";

export interface SheetTable {
  name: string;
  rows: string[][];
}

type Cell = string | number | boolean | Date | null | undefined;

/** Spreadsheet cell -> the string a CSV export would have had. */
export function cellToString(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) {
    // Excel dates carry no zone; read-excel-file hands them over as UTC midnight.
    if (Number.isNaN(cell.getTime())) return "";
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return "";
    // Avoid float noise like 1250.4999999 without inventing precision.
    return Number.isInteger(cell) ? String(cell) : String(Math.round(cell * 100) / 100);
  }
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  return String(cell).trim();
}

export async function readWorkbook(buffer: Buffer): Promise<SheetTable[]> {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(buffer);
  return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((row) => row.map((c) => cellToString(c as Cell))) }));
}

/** Runs the statement table parser on every sheet and keeps the one that yields the most rows. */
export function parseWorkbookStatement(sheets: readonly SheetTable[]): ParseCsvResult {
  let best: ParseCsvResult = { rows: [], skipped: [] };
  for (const sheet of sheets) {
    const result = parseStatementTable(sheet.rows);
    if (result.rows.length > best.rows.length || (best.rows.length === 0 && result.skipped.length > best.skipped.length)) best = result;
  }
  return best;
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * The workbook as compact CSV text for the AI, sheet by sheet. Empty rows and trailing
 * empty cells are dropped; capped so a huge sheet cannot blow the request size.
 */
export function workbookToText(sheets: readonly SheetTable[], maxChars = 120_000): string {
  const parts: string[] = [];
  let used = 0;
  for (const sheet of sheets) {
    const lines: string[] = [];
    for (const row of sheet.rows) {
      let end = row.length;
      while (end > 0 && row[end - 1] === "") end--;
      if (end === 0) continue;
      lines.push(row.slice(0, end).map(csvCell).join(","));
    }
    if (lines.length === 0) continue;
    const block = `### Sheet: ${sheet.name}\n${lines.join("\n")}`;
    if (used + block.length > maxChars) {
      parts.push(block.slice(0, Math.max(0, maxChars - used)) + "\n[truncated]");
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n");
}
