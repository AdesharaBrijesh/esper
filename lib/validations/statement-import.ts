import { z } from "zod";
import { dateOnlySchema, idSchema, moneyString, optionalText } from "./common";

export const importRowSchema = z.object({
  date: dateOnlySchema,
  description: optionalText(200),
  amount: moneyString,
  direction: z.enum(["debit", "credit"]),
  categoryId: idSchema,
});
export type ImportRowInput = z.input<typeof importRowSchema>;

export const confirmImportSchema = z.object({
  accountId: idSchema,
  owner: z.enum(["SELF", "BROTHER"]),
  paymentMode: z.enum(["CASH", "UPI", "BANK", "CARD", "TRANSFER", "OTHER"]),
  rows: z.array(importRowSchema).min(1, "No rows to import").max(2000),
});
export type ConfirmImportInput = z.input<typeof confirmImportSchema>;
