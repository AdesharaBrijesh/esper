import { z } from "zod";
import { TRADING_KINDS } from "@/lib/calculations/ai-statement";
import { dateOnlySchema, idSchema, moneyString, optionalIdSchema, optionalText } from "./common";

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

export const tradingImportRowSchema = z.object({
  date: dateOnlySchema,
  kind: z.enum(TRADING_KINDS),
  amount: moneyString,
  description: optionalText(200),
});

export const confirmTradingImportSchema = z.object({
  tradingAccountId: idSchema,
  /** Needed only when there are deposits or withdrawals. */
  bankAccountId: optionalIdSchema,
  rows: z.array(tradingImportRowSchema).min(1, "No rows to import").max(2000),
});
export type ConfirmTradingImportInput = z.input<typeof confirmTradingImportSchema>;
