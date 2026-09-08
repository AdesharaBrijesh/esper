/**
 * Shared result type for server actions. Always serializable.
 */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = null>(error: string, fieldErrors?: Record<string, string[]>): ActionResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Plain, client-safe shapes (Decimals as strings, dates as "YYYY-MM-DD"). */
import type {
  AccountType,
  CategoryType,
  LoanDirection,
  LoanStatus,
  Owner,
  PaymentMode,
  TransactionType,
} from "@/generated/prisma/enums";

export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  owner: Owner;
  openingBalance: string;
  isActive: boolean;
  sortOrder: number;
  /** Derived current balance. */
  balance: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PersonDTO {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

export interface LoanDTO {
  id: string;
  personId: string;
  personName: string;
  direction: LoanDirection;
  originalAmount: string;
  outstandingAmount: string;
  status: LoanStatus;
  notes: string | null;
  startDate: string;
}

export interface TransactionDTO {
  id: string;
  type: TransactionType;
  amount: string;
  owner: Owner;
  paymentMode: PaymentMode;
  notes: string | null;
  transactionDate: string;
  createdAt: string;
  categoryId: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  fromAccountId: string | null;
  fromAccount: { id: string; name: string; type: AccountType; owner: Owner } | null;
  toAccountId: string | null;
  toAccount: { id: string; name: string; type: AccountType; owner: Owner } | null;
  loanId: string | null;
  loan: { id: string; direction: LoanDirection; personId: string; personName: string } | null;
}
