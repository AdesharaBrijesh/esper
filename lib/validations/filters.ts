import { z } from "zod";
import { OWNERS, PAYMENT_MODES, TRANSACTION_TYPES } from "@/lib/constants";
import { dateOnlySchema } from "./common";

const GROUPS = ["EXPENSE", "INCOME", "TRANSFER", "TRADING", "LOAN"] as const;

export const transactionFilterSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  group: z.enum(GROUPS).optional(),
  categoryId: z.string().trim().max(64).optional(),
  accountId: z.string().trim().max(64).optional(),
  owner: z.enum(OWNERS).optional(),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  loanId: z.string().trim().max(64).optional(),
  personId: z.string().trim().max(64).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type TransactionFilters = z.output<typeof transactionFilterSchema>;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v === "" ? undefined : v;
}

/**
 * Parses URL search params into filters. Invalid or unknown values are dropped
 * field-by-field instead of failing the whole page.
 */
export function parseTransactionFilters(searchParams: SearchParams): TransactionFilters {
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(transactionFilterSchema.shape)) {
    raw[key] = first(searchParams[key]);
  }
  const normalise = (f: TransactionFilters): TransactionFilters => {
    if (f.from && f.to && f.from > f.to) return { ...f, from: f.to, to: f.from };
    return f;
  };
  const result = transactionFilterSchema.safeParse(raw);
  if (result.success) return normalise(result.data);

  // Drop the offending fields and re-parse.
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete raw[key];
  }
  const retry = transactionFilterSchema.safeParse(raw);
  return retry.success ? normalise(retry.data) : { page: 1 };
}

/** Builds a query string from filters (omits defaults/empties). */
export function filtersToSearchParams(filters: Partial<TransactionFilters>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "page" && v === 1) continue;
    params.set(k, String(v));
  }
  return params;
}
