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
  InstallmentStatus,
  LoanDirection,
  LoanStatus,
  Owner,
  PaymentMode,
  PlanFrequency,
  PlanKind,
  PlanStatus,
  TransactionType,
} from "@/generated/prisma/enums";
import type { InstallmentView } from "@/lib/constants";

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
  institution: string | null;
  last4: string | null;
  /** CARD only. */
  creditLimit: string | null;
  statementDay: number | null;
  dueDay: number | null;
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

export interface InstallmentDTO {
  id: string;
  planId: string;
  sequence: number;
  label: string | null;
  dueDate: string;
  amount: string;
  status: InstallmentStatus;
  paidDate: string | null;
  transactionId: string | null;
  notes: string | null;
  /** Derived from the due date and today; never stored. */
  view: InstallmentView;
}

export interface PlanDTO {
  id: string;
  kind: PlanKind;
  name: string;
  provider: string | null;
  amount: string;
  frequency: PlanFrequency;
  startDate: string;
  endDate: string | null;
  totalCount: number | null;
  owner: Owner;
  paymentMode: PaymentMode;
  categoryId: string | null;
  category: { id: string; name: string; icon: string | null; color: string | null } | null;
  fromAccountId: string | null;
  fromAccount: { id: string; name: string; type: AccountType } | null;
  toAccountId: string | null;
  toAccount: { id: string; name: string; type: AccountType } | null;
  remindDays: number;
  status: PlanStatus;
  notes: string | null;
  /** Rolled-up progress across this plan's instalments. */
  progress: {
    total: number;
    paid: number;
    pending: number;
    skipped: number;
    overdue: number;
    dueSoon: number;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    overdueAmount: string;
    percentPaid: number;
    nextDue: { dueDate: string; amount: string } | null;
  };
  /** Monthly-equivalent cost, so plans on different frequencies can be compared. */
  monthlyEquivalent: string;
}

export interface CardDTO {
  id: string;
  name: string;
  owner: Owner;
  institution: string | null;
  last4: string | null;
  isActive: boolean;
  /** Signed ledger balance: negative means money owed. */
  balance: string;
  outstanding: string;
  creditBalance: string;
  creditLimit: string | null;
  available: string | null;
  utilisation: number | null;
  level: "none" | "healthy" | "warn" | "danger";
  statementDay: number | null;
  dueDay: number | null;
  nextDueDate: string | null;
  nextStatementDate: string | null;
  /** Spend charged to this card in the current calendar month. */
  spentThisMonth: string;
}

export interface ValuationDTO {
  id: string;
  accountId: string;
  asOf: string;
  value: string;
  notes: string | null;
}

export interface InvestmentDTO {
  id: string;
  name: string;
  owner: Owner;
  institution: string | null;
  isActive: boolean;
  /** Net money contributed (the account balance). */
  invested: string;
  currentValue: string;
  gain: string;
  returnPercent: number | null;
  hasValuation: boolean;
  valuedOn: string | null;
  valuations: ValuationDTO[];
}
