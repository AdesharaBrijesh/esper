import { z } from "zod";
import { OWNERS, PAYMENT_MODES, TRANSACTION_FLOWS, TRANSACTION_TYPES } from "@/lib/constants";
import { dateOnlySchema, moneyString, optionalIdSchema, optionalText } from "./common";

/**
 * One flat schema for every transaction type. Which fields are required depends on
 * TRANSACTION_FLOWS[type]; the superRefine below enforces those structural rules.
 * Database-level rules (account kinds, ownership, category type, loan balance) are
 * enforced in lib/services/transactions.ts.
 */
export const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES, { message: "Choose a transaction type" }),
    amount: moneyString,
    transactionDate: dateOnlySchema,
    owner: z.enum(OWNERS, { message: "Choose an owner" }),
    paymentMode: z.enum(PAYMENT_MODES, { message: "Choose a payment mode" }),
    notes: optionalText(500),
    fromAccountId: optionalIdSchema,
    toAccountId: optionalIdSchema,
    categoryId: optionalIdSchema,
    /** BORROW / LEND: existing person (or provide personName to create one). */
    personId: optionalIdSchema,
    personName: z
      .string()
      .trim()
      .max(60)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    /** LOAN_REPAYMENT / LENT_REPAYMENT: the loan being repaid. */
    loanId: optionalIdSchema,
  })
  .superRefine((d, ctx) => {
    const flow = TRANSACTION_FLOWS[d.type];

    if (flow.from === "required" && !d.fromAccountId) {
      ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "Choose the account the money comes from" });
    }
    if (flow.from === "none" && d.fromAccountId) {
      ctx.addIssue({ code: "custom", path: ["fromAccountId"], message: "This transaction type has no source account" });
    }
    if (flow.to === "required" && !d.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the account the money goes to" });
    }
    if (flow.to === "none" && d.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "This transaction type has no destination account" });
    }
    if (d.fromAccountId && d.toAccountId && d.fromAccountId === d.toAccountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "From and To accounts must be different" });
    }
    if (flow.category === "required" && !d.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Choose a category" });
    }
    if (flow.category === "none" && d.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "This transaction type does not use a category" });
    }
    if (flow.loan === "creates") {
      if (!d.personId && !d.personName) {
        ctx.addIssue({ code: "custom", path: ["personId"], message: "Choose a person or enter a new name" });
      }
      if (d.loanId) {
        ctx.addIssue({ code: "custom", path: ["loanId"], message: "A new loan cannot reference an existing loan" });
      }
    }
    if (flow.loan === "repays" && !d.loanId) {
      ctx.addIssue({ code: "custom", path: ["loanId"], message: "Choose the loan being repaid" });
    }
    if (flow.loan === "none" && (d.loanId || d.personId || d.personName)) {
      ctx.addIssue({ code: "custom", path: ["loanId"], message: "This transaction type is not linked to a loan" });
    }
  });

/** Raw form values (strings) accepted by the schema. Use for react-hook-form. */
export type TransactionInput = z.input<typeof transactionSchema>;
/** Parsed and normalized values produced by the schema. */
export type TransactionData = z.output<typeof transactionSchema>;
