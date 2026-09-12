import { z } from "zod";
import {
  MAX_INSTALLMENTS,
  OWNERS,
  PAYMENT_MODES,
  PLAN_FREQUENCIES,
  PLAN_KINDS,
  PLAN_STATUSES,
} from "@/lib/constants";
import { dateOnlySchema, moneyString, optionalIdSchema, optionalText } from "./common";

/**
 * A plan is a template. The structural rules differ by kind: a SIP moves money into an
 * investment account and therefore needs a destination rather than a category, while
 * everything else is spending and needs a category.
 */
export const planSchema = z
  .object({
    kind: z.enum(PLAN_KINDS, { message: "Choose what this is" }),
    name: z.string().trim().min(1, "Give it a name").max(80),
    provider: optionalText(80),
    amount: moneyString,
    frequency: z.enum(PLAN_FREQUENCIES, { message: "Choose how often it repeats" }),
    startDate: dateOnlySchema,
    endDate: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    totalCount: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === "") return null;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isInteger(n) || n < 1) {
          ctx.addIssue({ code: "custom", message: "Enter a whole number of instalments" });
          return z.NEVER;
        }
        if (n > MAX_INSTALLMENTS) {
          ctx.addIssue({ code: "custom", message: `At most ${MAX_INSTALLMENTS} instalments` });
          return z.NEVER;
        }
        return n;
      }),
    owner: z.enum(OWNERS, { message: "Choose an owner" }),
    paymentMode: z.enum(PAYMENT_MODES, { message: "Choose a payment mode" }),
    categoryId: optionalIdSchema,
    fromAccountId: optionalIdSchema,
    toAccountId: optionalIdSchema,
    remindDays: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === "") return 3;
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 60) {
          ctx.addIssue({ code: "custom", message: "Remind between 0 and 60 days ahead" });
          return z.NEVER;
        }
        return n;
      }),
    status: z.enum(PLAN_STATUSES).default("ACTIVE"),
    notes: optionalText(500),
  })
  .superRefine((d, ctx) => {
    if (d.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.endDate)) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Enter a valid date (YYYY-MM-DD)" });
    }
    if (d.endDate && d.endDate < d.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be after the start date" });
    }

    if (d.kind === "SIP") {
      if (!d.toAccountId) {
        ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the investment account to fund" });
      }
      if (d.categoryId) {
        ctx.addIssue({ code: "custom", path: ["categoryId"], message: "A SIP moves money; it has no category" });
      }
    } else if (!d.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }

    if (!d.fromAccountId) {
      ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "Choose the account it is paid from" });
    }
    if (d.fromAccountId && d.toAccountId && d.fromAccountId === d.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "From and To accounts must be different" });
    }

    // An open-ended plan needs no count; a fixed one is clearer with it, but either an
    // end date or a count is enough to know when to stop.
    if (d.frequency === "ONE_TIME" && d.totalCount && d.totalCount > 1) {
      ctx.addIssue({ code: "custom", path: ["totalCount"], message: "A one-time plan has a single instalment" });
    }
  });

export type PlanInput = z.input<typeof planSchema>;
export type PlanData = z.output<typeof planSchema>;

/** Marking an instalment paid: the date and account actually used may differ from the plan. */
export const payInstallmentSchema = z.object({
  installmentId: z.string().trim().min(1).max(64),
  paidDate: dateOnlySchema,
  amount: moneyString,
  fromAccountId: z.string().trim().min(1, "Choose the account it was paid from").max(64),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  notes: optionalText(500),
});

export type PayInstallmentInput = z.input<typeof payInstallmentSchema>;
export type PayInstallmentData = z.output<typeof payInstallmentSchema>;

/** Bulk-marking a run of past instalments as paid, for backfilling previous years. */
export const bulkPaySchema = z.object({
  planId: z.string().trim().min(1).max(64),
  installmentIds: z.array(z.string().trim().min(1).max(64)).min(1, "Select at least one instalment").max(MAX_INSTALLMENTS),
  fromAccountId: z.string().trim().min(1, "Choose the account it was paid from").max(64),
  /** Each instalment is dated on its own due date, which is what backfilling wants. */
  useDueDate: z.boolean().default(true),
  paidDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export type BulkPayInput = z.input<typeof bulkPaySchema>;
export type BulkPayData = z.output<typeof bulkPaySchema>;

/** Editing a single instalment's amount or due date (a fee revision, a rent increase). */
export const installmentEditSchema = z.object({
  installmentId: z.string().trim().min(1).max(64),
  amount: moneyString,
  dueDate: dateOnlySchema,
  label: optionalText(60),
  notes: optionalText(500),
});

export type InstallmentEditInput = z.input<typeof installmentEditSchema>;

/** Adding more instalments to an open-ended plan, or extending a fixed one. */
export const extendPlanSchema = z.object({
  planId: z.string().trim().min(1).max(64),
  count: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 60) {
        ctx.addIssue({ code: "custom", message: "Add between 1 and 60 instalments" });
        return z.NEVER;
      }
      return n;
    }),
});

export type ExtendPlanInput = z.input<typeof extendPlanSchema>;
