import { z } from "zod";
import { parseMoneyInput } from "@/lib/money";
import { isDateOnly } from "@/lib/dates";

/** Positive money amount as a string, e.g. "1250" or "1,250.50". Output stays a normalized string "1250.50". */
export const moneyString = z
  .string()
  .trim()
  .min(1, "Amount is required")
  .transform((v, ctx) => {
    const d = parseMoneyInput(v);
    if (d === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount (up to 2 decimals)" });
      return z.NEVER;
    }
    if (!d.greaterThan(0)) {
      ctx.addIssue({ code: "custom", message: "Amount must be greater than 0" });
      return z.NEVER;
    }
    if (d.greaterThan("999999999999")) {
      ctx.addIssue({ code: "custom", message: "Amount is too large" });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

/** Money that may be zero or negative (opening balances). */
export const signedMoneyString = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return "0.00";
    const d = parseMoneyInput(v);
    if (d === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount (up to 2 decimals)" });
      return z.NEVER;
    }
    if (d.abs().greaterThan("999999999999")) {
      ctx.addIssue({ code: "custom", message: "Amount is too large" });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

export const dateOnlySchema = z
  .string()
  .trim()
  .refine((v) => isDateOnly(v), "Enter a valid date (YYYY-MM-DD)");

export const idSchema = z.string().trim().min(1, "Required").max(64);

export const optionalIdSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Optional free text; empty strings become null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #22c55e");

export const emojiSchema = z.string().trim().min(1).max(16);
