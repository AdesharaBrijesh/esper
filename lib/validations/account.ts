import { z } from "zod";
import { ACCOUNT_TYPES, OWNERS } from "@/lib/constants";
import { optionalText, signedMoneyString } from "./common";

/** Optional day-of-month (statement / bill due dates). Empty means "not tracked". */
const dayOfMonth = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      ctx.addIssue({ code: "custom", message: "Enter a day between 1 and 31" });
      return z.NEVER;
    }
    return n;
  });

/** Optional non-negative money. Empty means "not set". */
const optionalMoney = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const parsed = signedMoneyString.safeParse(String(v));
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount" });
      return z.NEVER;
    }
    if (Number(parsed.data) < 0) {
      ctx.addIssue({ code: "custom", message: "Must be zero or more" });
      return z.NEVER;
    }
    return parsed.data;
  });

export const accountSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(40, "Keep the name under 40 characters"),
    type: z.enum(ACCOUNT_TYPES, { message: "Choose an account type" }),
    owner: z.enum(OWNERS, { message: "Choose an owner" }),
    openingBalance: signedMoneyString,
    isActive: z.boolean().optional().default(true),
    institution: optionalText(60),
    last4: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\d{4}$/.test(v), "Enter the last 4 digits"),
    creditLimit: optionalMoney,
    statementDay: dayOfMonth,
    dueDay: dayOfMonth,
  })
  .superRefine((d, ctx) => {
    // Card-only fields on any other account type would just be dead data.
    if (d.type !== "CARD") {
      if (d.creditLimit !== null) {
        ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "Only card accounts have a credit limit" });
      }
      if (d.statementDay !== null) {
        ctx.addIssue({ code: "custom", path: ["statementDay"], message: "Only card accounts have a statement day" });
      }
      if (d.dueDay !== null) {
        ctx.addIssue({ code: "custom", path: ["dueDay"], message: "Only card accounts have a due day" });
      }
    }
  });

export type AccountInput = z.input<typeof accountSchema>;
export type AccountData = z.output<typeof accountSchema>;

/** A dated "what is it worth now" figure for an investment account. */
export const valuationSchema = z.object({
  accountId: z.string().trim().min(1, "Choose an investment account").max(64),
  asOf: z
    .string()
    .trim()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date (YYYY-MM-DD)"),
  value: signedMoneyString.refine((v) => Number(v) >= 0, "Value cannot be negative"),
  notes: optionalText(200),
});

export type ValuationInput = z.input<typeof valuationSchema>;
export type ValuationData = z.output<typeof valuationSchema>;
