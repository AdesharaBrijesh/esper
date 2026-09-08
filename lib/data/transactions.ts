import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { PAGE_SIZE, TRANSACTION_GROUPS, type OwnerFilter } from "@/lib/constants";
import { fromDateOnly, type DateRange } from "@/lib/dates";
import { toTransactionDTO, transactionInclude } from "@/lib/serialize";
import type { TransactionDTO } from "@/lib/types";
import type { TransactionFilters } from "@/lib/validations/filters";
import type { ReportTransactionLike } from "@/lib/calculations/reports";

export interface TransactionPage {
  items: TransactionDTO[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function buildTransactionWhere(userId: string, f: Partial<TransactionFilters>): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (f.from || f.to) {
    where.transactionDate = {
      ...(f.from ? { gte: fromDateOnly(f.from) } : {}),
      ...(f.to ? { lte: fromDateOnly(f.to) } : {}),
    };
  }
  if (f.type) where.type = f.type;
  else if (f.group) {
    const group = TRANSACTION_GROUPS.find((g) => g.value === f.group);
    if (group) where.type = { in: group.types };
  }
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.accountId) where.OR = [{ fromAccountId: f.accountId }, { toAccountId: f.accountId }];
  if (f.owner) where.owner = f.owner;
  if (f.paymentMode) where.paymentMode = f.paymentMode;
  if (f.loanId) where.loanId = f.loanId;
  if (f.personId) where.loan = { personId: f.personId };
  if (f.q) where.notes = { contains: f.q, mode: "insensitive" };
  return where;
}

const orderBy: Prisma.TransactionOrderByWithRelationInput[] = [
  { transactionDate: "desc" },
  { createdAt: "desc" },
];

export async function listTransactions(
  userId: string,
  filters: TransactionFilters,
  pageSize: number = PAGE_SIZE,
): Promise<TransactionPage> {
  const where = buildTransactionWhere(userId, filters);
  const page = Math.max(1, filters.page ?? 1);
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    items: rows.map(toTransactionDTO),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getRecentTransactions(
  userId: string,
  limit = 8,
  owner: OwnerFilter = "ALL",
): Promise<TransactionDTO[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, ...(owner !== "ALL" ? { owner } : {}) },
    include: transactionInclude,
    orderBy,
    take: limit,
  });
  return rows.map(toTransactionDTO);
}

export async function getTransactionById(userId: string, id: string): Promise<TransactionDTO | null> {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include: transactionInclude });
  return row ? toTransactionDTO(row) : null;
}

/** Lightweight rows for aggregation over a date range. */
export async function getTransactionsForReports(
  userId: string,
  range: DateRange,
  owner: OwnerFilter = "ALL",
): Promise<ReportTransactionLike[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      transactionDate: { gte: fromDateOnly(range.from), lte: fromDateOnly(range.to) },
      ...(owner !== "ALL" ? { owner } : {}),
    },
    select: {
      type: true,
      amount: true,
      owner: true,
      paymentMode: true,
      transactionDate: true,
      categoryId: true,
      category: { select: { id: true, name: true, icon: true, color: true } },
    },
    orderBy,
  });
  return rows;
}

/** Full (unpaginated) list for CSV export; capped to keep memory bounded. */
export async function getTransactionsForExport(
  userId: string,
  filters: Partial<TransactionFilters>,
  cap = 50000,
): Promise<TransactionDTO[]> {
  const rows = await prisma.transaction.findMany({
    where: buildTransactionWhere(userId, filters),
    include: transactionInclude,
    orderBy,
    take: cap,
  });
  return rows.map(toTransactionDTO);
}

export async function countTransactions(userId: string): Promise<number> {
  return prisma.transaction.count({ where: { userId } });
}
