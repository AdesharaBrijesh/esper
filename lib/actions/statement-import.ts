"use server";

import { requireUserId } from "@/lib/auth/dal";
import { runAction, revalidateAll } from "@/lib/actions/helpers";
import { previewStatement, type StatementPreview } from "@/lib/services/statement-import";
import { createTransaction } from "@/lib/services/transactions";
import { parseStatementCsv } from "@/lib/calculations/statement-csv";
import { extractPdfText, parseStatementPdfText } from "@/lib/calculations/statement-pdf";
import { confirmImportSchema, type ConfirmImportInput } from "@/lib/validations/statement-import";
import { AppError } from "@/lib/errors";
import { idSchema } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // a multi-year PDF statement can run a few MB

export async function previewStatementAction(formData: FormData): Promise<ActionResult<StatementPreview>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const accountId = idSchema.parse(formData.get("accountId"));
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AppError("Choose a CSV or PDF file to upload.");
    if (file.size === 0) throw new AppError("That file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new AppError("That file is too large (max 15MB).");

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const parsed = isPdf
      ? parseStatementPdfText(await extractPdfText(Buffer.from(await file.arrayBuffer())))
      : parseStatementCsv(await file.text());

    return previewStatement(userId, accountId, parsed);
  });
}

export async function confirmStatementImportAction(
  input: ConfirmImportInput,
): Promise<ActionResult<{ created: number; failed: { index: number; error: string }[] }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = confirmImportSchema.parse(input);
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

    revalidateAll();
    return { created, failed };
  });
}
