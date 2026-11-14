import { z } from "zod";
import { PAYMENT_MODES } from "@/lib/constants";
import { dateOnlySchema, idSchema, moneyString, optionalText } from "./common";

export const quickAddEntrySchema = z.object({
  amount: moneyString,
  description: optionalText(200),
  categoryId: idSchema,
  accountId: idSchema,
  paymentMode: z.enum(PAYMENT_MODES),
});

export const quickAddSchema = z.object({
  date: dateOnlySchema,
  entries: z.array(quickAddEntrySchema).min(1, "Nothing to add").max(100, "Add up to 100 at a time"),
});
export type QuickAddInput = z.input<typeof quickAddSchema>;
