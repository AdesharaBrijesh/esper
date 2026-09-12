/**
 * Shared enum values, labels and flow rules.
 * Safe to import from client components (no server-only code).
 */
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

export type {
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
};

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Esper";

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------
export const OWNERS = ["SELF", "BROTHER"] as const satisfies readonly Owner[];
export const OWNER_LABELS: Record<Owner, string> = { SELF: "Self", BROTHER: "Brother" };
/** "ALL" is a UI filter value, never stored. */
export type OwnerFilter = Owner | "ALL";
export const OWNER_FILTERS: { value: OwnerFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "SELF", label: "Self" },
  { value: "BROTHER", label: "Brother" },
];
/** Parses a raw `?owner=` search param into an OwnerFilter (defaults to ALL). */
export function parseOwnerFilter(value: string | string[] | undefined): OwnerFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "SELF" || v === "BROTHER" ? v : "ALL";
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export const ACCOUNT_TYPES = ["CASH", "BANK", "UPI", "CARD", "TRADING", "INVESTMENT", "OTHER"] as const satisfies readonly AccountType[];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Cash",
  BANK: "Bank",
  UPI: "UPI",
  CARD: "Card",
  TRADING: "Trading",
  INVESTMENT: "Investment",
  OTHER: "Other",
};
export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  CASH: "💵",
  BANK: "🏦",
  UPI: "📱",
  CARD: "💳",
  TRADING: "📈",
  INVESTMENT: "📊",
  OTHER: "🗂️",
};
/** Default payment mode implied by an account type. */
export const ACCOUNT_TYPE_PAYMENT_MODE: Record<AccountType, PaymentMode> = {
  CASH: "CASH",
  BANK: "BANK",
  UPI: "UPI",
  CARD: "CARD",
  TRADING: "TRANSFER",
  INVESTMENT: "TRANSFER",
  OTHER: "OTHER",
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export const CATEGORY_TYPES = ["EXPENSE", "INCOME"] as const satisfies readonly CategoryType[];
export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = { EXPENSE: "Expense", INCOME: "Income" };

export const DEFAULT_EXPENSE_CATEGORIES: { name: string; icon: string; color: string }[] = [
  { name: "Food", icon: "🍔", color: "#f97316" },
  { name: "Travel", icon: "🚌", color: "#0ea5e9" },
  { name: "Shopping", icon: "🛍️", color: "#ec4899" },
  { name: "Entertainment", icon: "🎬", color: "#8b5cf6" },
  { name: "Bills", icon: "🧾", color: "#eab308" },
  { name: "Health", icon: "💊", color: "#ef4444" },
  { name: "Education", icon: "📚", color: "#3b82f6" },
  { name: "Family", icon: "👨‍👩‍👦", color: "#14b8a6" },
  { name: "Gifts", icon: "🎁", color: "#f43f5e" },
  { name: "Miscellaneous", icon: "📦", color: "#64748b" },
];
export const DEFAULT_INCOME_CATEGORIES: { name: string; icon: string; color: string }[] = [
  { name: "Salary", icon: "💼", color: "#22c55e" },
  { name: "Allowance", icon: "🪙", color: "#84cc16" },
  { name: "Trading Profit", icon: "📈", color: "#10b981" },
  { name: "Gift", icon: "🎁", color: "#f43f5e" },
  { name: "Refund", icon: "↩️", color: "#06b6d4" },
  { name: "Other Income", icon: "➕", color: "#64748b" },
];
export const TRADING_PROFIT_CATEGORY_NAME = "Trading Profit";

/** Emoji palette offered in the category editor. */
export const CATEGORY_ICON_CHOICES = [
  "🍔", "☕", "🛒", "🚌", "🚕", "⛽", "🛍️", "👕", "🎬", "🎮", "🎵", "🧾", "💡", "📱", "🏠", "💊", "🏥",
  "📚", "🎓", "👨‍👩‍👦", "🎁", "📦", "💼", "🪙", "📈", "↩️", "➕", "✈️", "🏋️", "🐶", "💇", "🧴", "🔧", "🚗",
  "🍕", "🍺", "🎉", "💳", "🏦", "💵",
];
export const CATEGORY_COLOR_CHOICES = [
  "#f97316", "#0ea5e9", "#ec4899", "#8b5cf6", "#eab308", "#ef4444", "#3b82f6", "#14b8a6", "#f43f5e",
  "#64748b", "#22c55e", "#84cc16", "#10b981", "#06b6d4", "#a855f7", "#f59e0b",
];

// ---------------------------------------------------------------------------
// Payment modes
// ---------------------------------------------------------------------------
export const PAYMENT_MODES = ["CASH", "UPI", "BANK", "CARD", "TRANSFER", "OTHER"] as const satisfies readonly PaymentMode[];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK: "Bank",
  CARD: "Card",
  TRANSFER: "Transfer",
  OTHER: "Other",
};

// ---------------------------------------------------------------------------
// Transaction types
// ---------------------------------------------------------------------------
export const TRANSACTION_TYPES = [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "TRADING_DEPOSIT",
  "TRADING_WITHDRAWAL",
  "TRADING_PROFIT",
  "TRADING_LOSS",
  "BORROW",
  "LEND",
  "LOAN_REPAYMENT",
  "LENT_REPAYMENT",
] as const satisfies readonly TransactionType[];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
  TRADING_DEPOSIT: "Trading Deposit",
  TRADING_WITHDRAWAL: "Trading Withdrawal",
  TRADING_PROFIT: "Trading Profit",
  TRADING_LOSS: "Trading Loss",
  BORROW: "Borrowed",
  LEND: "Lent",
  LOAN_REPAYMENT: "Loan Repayment",
  LENT_REPAYMENT: "Repayment Received",
};

export const TRANSACTION_TYPE_ICONS: Record<TransactionType, string> = {
  EXPENSE: "🧾",
  INCOME: "💰",
  TRANSFER: "🔁",
  TRADING_DEPOSIT: "📥",
  TRADING_WITHDRAWAL: "📤",
  TRADING_PROFIT: "📈",
  TRADING_LOSS: "📉",
  BORROW: "🤝",
  LEND: "🫴",
  LOAN_REPAYMENT: "💸",
  LENT_REPAYMENT: "🪙",
};

/** High-level group used by the type selector and reports. */
export type TransactionGroup = "EXPENSE" | "INCOME" | "TRANSFER" | "TRADING" | "LOAN";
export const TRANSACTION_GROUPS: { value: TransactionGroup; label: string; types: TransactionType[] }[] = [
  { value: "EXPENSE", label: "Expense", types: ["EXPENSE"] },
  { value: "INCOME", label: "Income", types: ["INCOME"] },
  { value: "TRANSFER", label: "Transfer", types: ["TRANSFER"] },
  { value: "TRADING", label: "Trading", types: ["TRADING_DEPOSIT", "TRADING_WITHDRAWAL", "TRADING_PROFIT", "TRADING_LOSS"] },
  { value: "LOAN", label: "Borrow/Lend", types: ["BORROW", "LEND", "LOAN_REPAYMENT", "LENT_REPAYMENT"] },
];
export const TRANSACTION_TYPE_GROUP: Record<TransactionType, TransactionGroup> = {
  EXPENSE: "EXPENSE",
  INCOME: "INCOME",
  TRANSFER: "TRANSFER",
  TRADING_DEPOSIT: "TRADING",
  TRADING_WITHDRAWAL: "TRADING",
  TRADING_PROFIT: "TRADING",
  TRADING_LOSS: "TRADING",
  BORROW: "LOAN",
  LEND: "LOAN",
  LOAN_REPAYMENT: "LOAN",
  LENT_REPAYMENT: "LOAN",
};

/**
 * Money flow rules per transaction type.
 * - from: account the money leaves (balance decreases)
 * - to:   account the money enters (balance increases)
 * Each side is "required", "none".
 * accountKind constrains the account type on that side.
 */
export type AccountKind = "TRADING" | "NON_TRADING" | "ANY";
export interface TransactionFlow {
  from: "required" | "none";
  to: "required" | "none";
  fromKind: AccountKind;
  toKind: AccountKind;
  category: "required" | "optional" | "none";
  categoryType: CategoryType | null;
  loan: "creates" | "repays" | "none";
  /** How the amount is shown in lists: money out (-), in (+), or neutral. */
  sign: "out" | "in" | "neutral";
  description: string;
}

export const TRANSACTION_FLOWS: Record<TransactionType, TransactionFlow> = {
  // Trading accounts only move money through the TRADING_* types (and plain transfers),
  // so trading capital, deposits and results always agree.
  EXPENSE: {
    from: "required", to: "none", fromKind: "NON_TRADING", toKind: "ANY",
    category: "required", categoryType: "EXPENSE", loan: "none", sign: "out",
    description: "Money spent from an account.",
  },
  INCOME: {
    from: "none", to: "required", fromKind: "ANY", toKind: "NON_TRADING",
    category: "required", categoryType: "INCOME", loan: "none", sign: "in",
    description: "Money received into an account.",
  },
  TRANSFER: {
    from: "required", to: "required", fromKind: "ANY", toKind: "ANY",
    category: "none", categoryType: null, loan: "none", sign: "neutral",
    description: "Move money between your own accounts (e.g. Cash → Bank, or Self Trading → Brother Trading). Net worth does not change.",
  },
  TRADING_DEPOSIT: {
    from: "required", to: "required", fromKind: "NON_TRADING", toKind: "TRADING",
    category: "none", categoryType: null, loan: "none", sign: "neutral",
    description: "Move money from a bank/cash account into a trading account.",
  },
  TRADING_WITHDRAWAL: {
    from: "required", to: "required", fromKind: "TRADING", toKind: "NON_TRADING",
    category: "none", categoryType: null, loan: "none", sign: "neutral",
    description: "Move money out of a trading account into bank/cash.",
  },
  TRADING_PROFIT: {
    from: "none", to: "required", fromKind: "ANY", toKind: "TRADING",
    category: "optional", categoryType: "INCOME", loan: "none", sign: "in",
    description: "Profit booked inside a trading account.",
  },
  TRADING_LOSS: {
    from: "required", to: "none", fromKind: "TRADING", toKind: "ANY",
    category: "optional", categoryType: "EXPENSE", loan: "none", sign: "out",
    description: "Loss booked inside a trading account.",
  },
  BORROW: {
    from: "none", to: "required", fromKind: "ANY", toKind: "NON_TRADING",
    category: "none", categoryType: null, loan: "creates", sign: "in",
    description: "Money borrowed from a person into your account. Creates a debt.",
  },
  LEND: {
    from: "required", to: "none", fromKind: "NON_TRADING", toKind: "ANY",
    category: "none", categoryType: null, loan: "creates", sign: "out",
    description: "Money lent to a person from your account. Creates a receivable.",
  },
  LOAN_REPAYMENT: {
    from: "required", to: "none", fromKind: "NON_TRADING", toKind: "ANY",
    category: "none", categoryType: null, loan: "repays", sign: "out",
    description: "Repaying money you borrowed.",
  },
  LENT_REPAYMENT: {
    from: "none", to: "required", fromKind: "ANY", toKind: "NON_TRADING",
    category: "none", categoryType: null, loan: "repays", sign: "in",
    description: "Receiving money you had lent.",
  },
};

export const LOAN_DIRECTIONS = ["BORROWED", "LENT"] as const satisfies readonly LoanDirection[];
export const LOAN_DIRECTION_LABELS: Record<LoanDirection, string> = { BORROWED: "You owe", LENT: "Owed to you" };
export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = { ACTIVE: "Active", PAID: "Paid" };

/** Loan direction produced by a loan-creating transaction type. */
export const LOAN_DIRECTION_FOR_TYPE: Partial<Record<TransactionType, LoanDirection>> = {
  BORROW: "BORROWED",
  LEND: "LENT",
};
/** Repayment transaction type for a loan direction. */
export const REPAYMENT_TYPE_FOR_DIRECTION: Record<LoanDirection, TransactionType> = {
  BORROWED: "LOAN_REPAYMENT",
  LENT: "LENT_REPAYMENT",
};

export const SESSION_COOKIE_NAME = "esper_session";
export const SESSION_DURATION_DAYS = 30;
export const PAGE_SIZE = 30;

// ---------------------------------------------------------------------------
// Portfolio accounts
// ---------------------------------------------------------------------------
/**
 * Accounts that hold money rather than spend it. You never pay for lunch straight out
 * of a mutual fund: money is transferred in and out, and results are recorded
 * separately (trading P&L, investment valuations). Keeping them out of the plain
 * expense/income flows is what stops the trading and investment summaries from
 * disagreeing with the ledger.
 */
export const PORTFOLIO_ACCOUNT_TYPES = ["TRADING", "INVESTMENT"] as const satisfies readonly AccountType[];

export function isPortfolioAccount(type: AccountType): boolean {
  return type === "TRADING" || type === "INVESTMENT";
}

// ---------------------------------------------------------------------------
// Plans (fees, subscriptions, bills, EMIs, SIPs)
// ---------------------------------------------------------------------------
export const PLAN_KINDS = ["FEE", "SUBSCRIPTION", "BILL", "EMI", "SIP", "OTHER"] as const satisfies readonly PlanKind[];

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  FEE: "Fees",
  SUBSCRIPTION: "Subscription",
  BILL: "Bill",
  EMI: "EMI",
  SIP: "SIP",
  OTHER: "Other",
};

export const PLAN_KIND_ICONS: Record<PlanKind, string> = {
  FEE: "🎓",
  SUBSCRIPTION: "🔁",
  BILL: "🧾",
  EMI: "🏠",
  SIP: "🌱",
  OTHER: "📌",
};

export const PLAN_KIND_HINTS: Record<PlanKind, string> = {
  FEE: "School, college, bachelor's or master's fees — usually a fixed number of terms.",
  SUBSCRIPTION: "Netflix, Spotify, gym, cloud storage — renews until you cancel.",
  BILL: "Rent, electricity, internet, phone — recurring but variable.",
  EMI: "Loan or purchase instalments with a known end date.",
  SIP: "A recurring investment. Moves money into an investment account instead of spending it.",
  OTHER: "Anything else that repeats on a schedule.",
};

/**
 * The transaction a paid instalment produces. A SIP moves money into an investment
 * account (net worth unchanged); everything else is money genuinely spent.
 */
export const PLAN_TRANSACTION_TYPE: Record<PlanKind, TransactionType> = {
  FEE: "EXPENSE",
  SUBSCRIPTION: "EXPENSE",
  BILL: "EXPENSE",
  EMI: "EXPENSE",
  SIP: "TRANSFER",
  OTHER: "EXPENSE",
};

export const PLAN_FREQUENCIES = [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "ONE_TIME",
] as const satisfies readonly PlanFrequency[];

export const PLAN_FREQUENCY_LABELS: Record<PlanFrequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  ONE_TIME: "One-time",
};

/** Months between instalments. WEEKLY is handled separately (7 days). */
export const PLAN_FREQUENCY_MONTHS: Record<PlanFrequency, number> = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
  ONE_TIME: 0,
};

/** What one instalment is called, for labels like "Semester 3 of 8". */
export const PLAN_TERM_NOUN: Record<PlanFrequency, string> = {
  WEEKLY: "Week",
  MONTHLY: "Month",
  QUARTERLY: "Quarter",
  HALF_YEARLY: "Term",
  YEARLY: "Year",
  ONE_TIME: "Payment",
};

export const PLAN_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const satisfies readonly PlanStatus[];
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const INSTALLMENT_STATUSES = ["PENDING", "PAID", "SKIPPED"] as const satisfies readonly InstallmentStatus[];
export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  SKIPPED: "Skipped",
};

/** Derived, not stored: a PENDING instalment whose due date has passed reads as overdue. */
export type InstallmentView = "PAID" | "SKIPPED" | "OVERDUE" | "DUE_SOON" | "UPCOMING";
export const INSTALLMENT_VIEW_LABELS: Record<InstallmentView, string> = {
  PAID: "Paid",
  SKIPPED: "Skipped",
  OVERDUE: "Overdue",
  DUE_SOON: "Due soon",
  UPCOMING: "Upcoming",
};

/** Hard cap on generated instalments, so an open-ended plan cannot run away. */
export const MAX_INSTALLMENTS = 240;

/** How far ahead open-ended plans (subscriptions) schedule instalments. */
export const OPEN_ENDED_MONTHS_AHEAD = 12;

// ---------------------------------------------------------------------------
// Credit cards
// ---------------------------------------------------------------------------
/** Utilisation above this is flagged; the usual advice is to stay under 30%. */
export const CARD_UTILISATION_WARN = 30;
export const CARD_UTILISATION_DANGER = 75;
