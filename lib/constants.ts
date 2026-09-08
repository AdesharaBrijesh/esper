/**
 * Shared enum values, labels and flow rules.
 * Safe to import from client components (no server-only code).
 */
import type {
  AccountType,
  CategoryType,
  LoanDirection,
  LoanStatus,
  Owner,
  PaymentMode,
  TransactionType,
} from "@/generated/prisma/enums";

export type { AccountType, CategoryType, LoanDirection, LoanStatus, Owner, PaymentMode, TransactionType };

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Leno Expenses";

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
export const ACCOUNT_TYPES = ["CASH", "BANK", "UPI", "CARD", "TRADING", "OTHER"] as const satisfies readonly AccountType[];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CASH: "Cash",
  BANK: "Bank",
  UPI: "UPI",
  CARD: "Card",
  TRADING: "Trading",
  OTHER: "Other",
};
export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  CASH: "💵",
  BANK: "🏦",
  UPI: "📱",
  CARD: "💳",
  TRADING: "📈",
  OTHER: "🗂️",
};
/** Default payment mode implied by an account type. */
export const ACCOUNT_TYPE_PAYMENT_MODE: Record<AccountType, PaymentMode> = {
  CASH: "CASH",
  BANK: "BANK",
  UPI: "UPI",
  CARD: "CARD",
  TRADING: "TRANSFER",
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

export const SESSION_COOKIE_NAME = "leno_session";
export const SESSION_DURATION_DAYS = 30;
export const PAGE_SIZE = 30;
