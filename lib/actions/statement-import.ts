"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, runAction, revalidateAll } from "@/lib/actions/helpers";
import { previewStatement, previewTrading, type StatementPreview, type TradingPreview } from "@/lib/services/statement-import";
import { createTransaction } from "@/lib/services/transactions";
import { parseStatementCsv, type ParseCsvResult, type SkippedLine } from "@/lib/calculations/statement-csv";
import { extractPdfText, parseStatementPdfText } from "@/lib/calculations/statement-pdf";
import { parseWorkbookStatement, readWorkbook, workbookToText } from "@/lib/calculations/statement-xlsx";
import { normalizeAiBankRows, normalizeAiTradingRows } from "@/lib/calculations/ai-statement";
import { extractBankRows, extractTradingRows, type AiSource } from "@/lib/ai/extract-statement";
import { isAiConfigured } from "@/lib/ai/gemini";
import {
  confirmImportSchema,
  confirmTradingImportSchema,
  type ConfirmImportInput,
  type ConfirmTradingImportInput,
} from "@/lib/validations/statement-import";
import { TRADING_PROFIT_CATEGORY_NAME } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { todayDateOnly } from "@/lib/dates";
import { idSchema } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/types";

/** Vercel caps a request body at 4.5MB; the client compresses photos to stay under this. */
const MAX_TOTAL_BYTES = 4.4 * 1024 * 1024;
const MAX_FILES = 10;

type FileKind = "csv" | "xlsx" | "xls" | "pdf" | "image" | "unknown";

function kindOf(file: File): FileKind {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (name.endsWith(".csv") || type === "text/csv") return "csv";
  if (name.endsWith(".xlsx") || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
  if (name.endsWith(".xls") || type === "application/vnd.ms-excel") return "xls";
  if (name.endsWith(".pdf") || type === "application/pdf") return "pdf";
  if (type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) return "image";
  return "unknown";
}

function imageMime(file: File): string {
  if (file.type.startsWith("image/")) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

/** Bank PDFs are often password-protected; neither the text reader nor the AI can open those. */
function assertNotEncrypted(buffer: Buffer, name: string) {
  if (buffer.includes("/Encrypt")) {
    throw new AppError(
      `${name} is password-protected. Open it with its password, save or print it as a new PDF without one, and upload that.`,
    );
  }
}

function readFiles(formData: FormData): File[] {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new AppError("Choose a file to upload.");
  if (files.length > MAX_FILES) throw new AppError(`Upload up to ${MAX_FILES} files at a time.`);
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new AppError("That's too much for one upload (max about 4MB). Split it into smaller uploads.");
  return files;
}

const prefixSkipped = (skipped: SkippedLine[], name: string, multi: boolean): SkippedLine[] =>
  multi ? skipped.map((s) => ({ ...s, reason: `${name}: ${s.reason}` })) : skipped;

export type ImportPreview =
  | ({ mode: "bank"; usedAi: boolean; note: string | null } & StatementPreview)
  | ({ mode: "trading"; usedAi: true; note: string | null } & TradingPreview);

export async function previewStatementAction(formData: FormData): Promise<ActionResult<ImportPreview>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const accountId = idSchema.parse(formData.get("accountId"));
    const mode = formData.get("mode") === "trading" ? "trading" : "bank";
    const aiAvailable = isAiConfigured();
    const useAi = aiAvailable && formData.get("useAi") !== "0";
    const files = readFiles(formData);
    const multi = files.length > 1;
    const today = todayDateOnly();

    // ---- Broker reports: always read by the AI (every broker lays them out differently) --
    if (mode === "trading") {
      if (!aiAvailable) {
        throw new AppError("Reading broker reports needs AI. Add GEMINI_API_KEY to the server environment to turn it on.");
      }
      const sources: AiSource[] = [];
      for (const file of files) {
        const kind = kindOf(file);
        const buffer = Buffer.from(await file.arrayBuffer());
        if (kind === "xls") throw new AppError(`${file.name} is an old .xls file. Save it as .xlsx or CSV and upload that.`);
        if (kind === "unknown") throw new AppError(`${file.name} isn't a file type Esper can read (CSV, Excel, PDF or a photo).`);
        if (kind === "csv") sources.push({ kind: "text", name: file.name, text: buffer.toString("utf8").slice(0, 120_000) });
        else if (kind === "xlsx") sources.push({ kind: "text", name: file.name, text: workbookToText(await readWorkbook(buffer)) });
        else {
          if (kind === "pdf") assertNotEncrypted(buffer, file.name);
          sources.push({ kind: "file", name: file.name, mimeType: kind === "pdf" ? "application/pdf" : imageMime(file), data: buffer });
        }
      }
      const extracted = await extractTradingRows(sources, { today });
      const normalized = normalizeAiTradingRows(extracted.rows, today);
      const preview = await previewTrading(userId, accountId, normalized);
      return { mode: "trading", usedAi: true, note: extracted.note || null, ...preview };
    }

    // ---- Bank / UPI: exact parsers first, the AI for what they cannot read -------------
    const results: { result: ParseCsvResult; hints: (string | null)[] }[] = [];
    const aiSources: AiSource[] = [];
    const notes: string[] = [];

    for (const file of files) {
      const kind = kindOf(file);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (kind === "unknown") throw new AppError(`${file.name} isn't a file type Esper can read (CSV, Excel, PDF or a photo).`);
      if (kind === "xls") throw new AppError(`${file.name} is an old .xls file. Save it as .xlsx or CSV and upload that.`);

      if (kind === "image") {
        if (!useAi) {
          throw new AppError(
            aiAvailable ? "Photos and screenshots need AI reading. Turn it on and try again." : "Reading photos needs AI. Add GEMINI_API_KEY to turn it on.",
          );
        }
        aiSources.push({ kind: "file", name: file.name, mimeType: imageMime(file), data: buffer });
        continue;
      }

      if (kind === "pdf") {
        assertNotEncrypted(buffer, file.name);
        // The AI reads layout, scanned pages and screenshots-as-PDF far better than line heuristics.
        if (useAi) {
          aiSources.push({ kind: "file", name: file.name, mimeType: "application/pdf", data: buffer });
          continue;
        }
        const result = parseStatementPdfText(await extractPdfText(buffer));
        if (result.rows.length === 0) notes.push(`${file.name}: no rows could be read. If it's a scanned PDF, turn on AI reading.`);
        results.push({ result: { rows: result.rows, skipped: prefixSkipped(result.skipped, file.name, multi) }, hints: result.rows.map(() => null) });
        continue;
      }

      // CSV / Excel: deterministic parsing is exact; only fall back when no header was found.
      const sheets = kind === "xlsx" ? await readWorkbook(buffer) : null;
      const result = sheets ? parseWorkbookStatement(sheets) : parseStatementCsv(buffer.toString("utf8"));
      if (result.rows.length === 0 && useAi) {
        aiSources.push({ kind: "text", name: file.name, text: sheets ? workbookToText(sheets) : buffer.toString("utf8").slice(0, 120_000) });
        continue;
      }
      results.push({ result: { rows: result.rows, skipped: prefixSkipped(result.skipped, file.name, multi) }, hints: result.rows.map(() => null) });
    }

    let usedAi = false;
    if (aiSources.length > 0) {
      const categories = await prisma.category.findMany({ where: { userId, isActive: true }, select: { name: true, type: true } });
      const extracted = await extractBankRows(aiSources, {
        today,
        expenseCategories: categories.filter((c) => c.type === "EXPENSE").map((c) => c.name),
        incomeCategories: categories.filter((c) => c.type === "INCOME").map((c) => c.name),
      });
      const normalized = normalizeAiBankRows(extracted.rows, today);
      results.push({ result: { rows: normalized.rows, skipped: normalized.skipped }, hints: normalized.categoryHints });
      if (extracted.note) notes.push(extracted.note);
      usedAi = true;
    }

    const merged: ParseCsvResult = { rows: results.flatMap((r) => r.result.rows), skipped: results.flatMap((r) => r.result.skipped) };
    const preview = await previewStatement(userId, accountId, merged, { categoryHints: results.flatMap((r) => r.hints) });
    return { mode: "bank", usedAi, note: notes.length ? notes.join(" ") : null, ...preview };
  });
}

export async function confirmStatementImportAction(
  input: ConfirmImportInput,
): Promise<ActionResult<{ created: number; failed: { index: number; error: string }[] }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(confirmImportSchema, input);
    let created = 0;
    const failed: { index: number; error: string }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      try {
        await createTransaction(userId, {
          type: row.direction === "debit" ? "EXPENSE" : "INCOME",
          amount: row.amount,
          transactionDate: row.date,
          owner: data.owner,
          paymentMode: data.paymentMode,
          notes: row.description,
          fromAccountId: row.direction === "debit" ? data.accountId : "",
          toAccountId: row.direction === "credit" ? data.accountId : "",
          categoryId: row.categoryId,
        });
        created++;
      } catch (err) {
        failed.push({ index: i, error: err instanceof AppError ? err.message : "Could not create this transaction" });
      }
    }

    if (created > 0) revalidateAll();
    return { created, failed };
  });
}

/**
 * Broker entries -> trading transactions:
 *   profit -> TRADING_PROFIT into the trading account
 *   loss, charges -> TRADING_LOSS out of it
 *   deposit -> TRADING_DEPOSIT bank -> trading; withdrawal -> TRADING_WITHDRAWAL trading -> bank
 */
export async function confirmTradingImportAction(
  input: ConfirmTradingImportInput,
): Promise<ActionResult<{ created: number; failed: { index: number; error: string }[] }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(confirmTradingImportSchema, input);
    const trading = await prisma.account.findFirst({
      where: { id: data.tradingAccountId, userId, type: "TRADING" },
      select: { id: true, owner: true },
    });
    if (!trading) throw new AppError("Choose your trading account.");
    const needsBank = data.rows.some((r) => r.kind === "deposit" || r.kind === "withdrawal");
    if (needsBank && !data.bankAccountId) throw new AppError("Choose the bank account your funds moved to and from.");
    const profitCategory = await prisma.category.findFirst({
      where: { userId, type: "INCOME", isActive: true, name: TRADING_PROFIT_CATEGORY_NAME },
      select: { id: true },
    });

    let created = 0;
    const failed: { index: number; error: string }[] = [];
    for (const [i, row] of data.rows.entries()) {
      const base = {
        amount: row.amount,
        transactionDate: row.date,
        owner: trading.owner,
        paymentMode: "TRANSFER" as const,
        notes: row.kind === "charges" && !/charge/i.test(row.description ?? "") ? `Charges · ${row.description ?? ""}`.trim() : row.description,
      };
      const input =
        row.kind === "profit"
          ? { ...base, type: "TRADING_PROFIT" as const, toAccountId: trading.id, categoryId: profitCategory?.id ?? "" }
          : row.kind === "loss" || row.kind === "charges"
            ? { ...base, type: "TRADING_LOSS" as const, fromAccountId: trading.id }
            : row.kind === "deposit"
              ? { ...base, type: "TRADING_DEPOSIT" as const, fromAccountId: data.bankAccountId!, toAccountId: trading.id }
              : { ...base, type: "TRADING_WITHDRAWAL" as const, fromAccountId: trading.id, toAccountId: data.bankAccountId! };
      try {
        await createTransaction(userId, input);
        created++;
      } catch (err) {
        failed.push({ index: i, error: err instanceof AppError ? err.message : "Could not create this entry" });
      }
    }
    if (created > 0) revalidateAll();
    return { created, failed };
  });
}
