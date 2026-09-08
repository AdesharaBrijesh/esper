import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { moneyToString, type MoneyInput } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import type { AccountDTO, CategoryDTO, LoanDTO, PersonDTO, TransactionDTO } from "@/lib/types";

/** Standard include used everywhere a transaction is listed. */
export const transactionInclude = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  fromAccount: { select: { id: true, name: true, type: true, owner: true } },
  toAccount: { select: { id: true, name: true, type: true, owner: true } },
  loan: {
    select: {
      id: true,
      direction: true,
      personId: true,
      person: { select: { name: true } },
    },
  },
} satisfies Prisma.TransactionInclude;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export function toTransactionDTO(t: TransactionRow): TransactionDTO {
  return {
    id: t.id,
    type: t.type,
    amount: moneyToString(t.amount),
    owner: t.owner,
    paymentMode: t.paymentMode,
    notes: t.notes,
    transactionDate: toDateOnly(t.transactionDate),
    createdAt: t.createdAt.toISOString(),
    categoryId: t.categoryId,
    category: t.category,
    fromAccountId: t.fromAccountId,
    fromAccount: t.fromAccount,
    toAccountId: t.toAccountId,
    toAccount: t.toAccount,
    loanId: t.loanId,
    loan: t.loan
      ? { id: t.loan.id, direction: t.loan.direction, personId: t.loan.personId, personName: t.loan.person.name }
      : null,
  };
}

type AccountRow = Prisma.AccountGetPayload<Record<string, never>>;

export function toAccountDTO(a: AccountRow, balance: MoneyInput): AccountDTO {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    owner: a.owner,
    openingBalance: moneyToString(a.openingBalance),
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    balance: moneyToString(balance),
  };
}

type CategoryRow = Prisma.CategoryGetPayload<Record<string, never>>;

export function toCategoryDTO(c: CategoryRow): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    isActive: c.isActive,
    sortOrder: c.sortOrder,
  };
}

type PersonRow = Prisma.PersonGetPayload<Record<string, never>>;

export function toPersonDTO(p: PersonRow): PersonDTO {
  return { id: p.id, name: p.name, phone: p.phone, notes: p.notes };
}

type LoanRow = Prisma.LoanGetPayload<{ include: { person: { select: { name: true } } } }>;

export function toLoanDTO(l: LoanRow): LoanDTO {
  return {
    id: l.id,
    personId: l.personId,
    personName: l.person.name,
    direction: l.direction,
    originalAmount: moneyToString(l.originalAmount),
    outstandingAmount: moneyToString(l.outstandingAmount),
    status: l.status,
    notes: l.notes,
    startDate: toDateOnly(l.startDate),
  };
}
