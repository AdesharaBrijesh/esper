import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AccountType, CategoryType, LoanDirection, Owner, TransactionType } from "@/generated/prisma/enums";
import { transactionSchema, type TransactionData } from "@/lib/validations/transaction";
import {
  isPortfolioAccount,
  LOAN_DIRECTION_FOR_TYPE,
  OWNER_LABELS,
  REPAYMENT_TYPE_FOR_DIRECTION,
  TRANSACTION_FLOWS,
  TRANSACTION_TYPE_LABELS,
  type AccountKind,
} from "@/lib/constants";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  computeLoanOutstanding,
  loanStatusFor,
  validateOriginalAmountChange,
  validateRepaymentAmount,
} from "@/lib/calculations/loans";
import { fromDateOnly } from "@/lib/dates";
import { sum, toDecimal } from "@/lib/money";

/**
 * The single place where transactions are created, edited and deleted.
 * Every path runs inside one database transaction so account balances
 * (derived) and loan outstanding amounts (persisted) never drift apart.
 */

type Tx = Prisma.TransactionClient;

/** Repayment/loan checks read-then-write; serializable isolation stops two concurrent submissions from overpaying. */
const TX_OPTIONS = { isolationLevel: "Serializable" as const, maxWait: 5000, timeout: 15000 };

interface AccountLite {
  id: string;
  name: string;
  type: AccountType;
  owner: Owner;
  isActive: boolean;
}

function fieldError(path: string, message: string): AppError {
  return new AppError(message, { [path]: [message] });
}

export function parseTransactionInput(input: unknown): TransactionData {
  const result = transactionSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? String(issue.path[0]) : "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new AppError("Please fix the highlighted fields.", fieldErrors);
  }
  return result.data;
}

async function loadAccount(
  tx: Tx,
  userId: string,
  accountId: string,
  path: "fromAccountId" | "toAccountId",
  allowInactiveId?: string | null,
): Promise<AccountLite> {
  const account = await tx.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, name: true, type: true, owner: true, isActive: true },
  });
  if (!account) throw fieldError(path, "Account not found");
  if (!account.isActive && account.id !== allowInactiveId) {
    throw fieldError(path, `${account.name} is archived. Unarchive it to use it.`);
  }
  return account;
}

function assertKind(account: AccountLite, kind: AccountKind, path: "fromAccountId" | "toAccountId") {
  if (kind === "TRADING" && account.type !== "TRADING") {
    throw fieldError(path, `${account.name} is not a trading account`);
  }
  // Portfolio accounts (trading, investment) hold money rather than spend it: they are
  // funded and redeemed through transfers, and their results are recorded separately.
  if (kind === "NON_TRADING" && isPortfolioAccount(account.type)) {
    throw fieldError(
      path,
      account.type === "TRADING"
        ? `${account.name} is a trading account; use a Trading deposit/withdrawal/profit/loss (or a transfer) instead`
        : `${account.name} is an investment account; use a transfer to move money in or out, and record its worth with a valuation`,
    );
  }
}

async function assertCategory(tx: Tx, userId: string, categoryId: string, expected: CategoryType | null) {
  const category = await tx.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, type: true, isActive: true, name: true },
  });
  if (!category) throw fieldError("categoryId", "Category not found");
  if (expected && category.type !== expected) {
    throw fieldError("categoryId", `${category.name} is an ${category.type.toLowerCase()} category`);
  }
}

/** Validates accounts/category for the given data and returns the loaded accounts. */
async function validateStructure(
  tx: Tx,
  userId: string,
  data: TransactionData,
  existing?: { fromAccountId: string | null; toAccountId: string | null } | null,
): Promise<{ from: AccountLite | null; to: AccountLite | null }> {
  const flow = TRANSACTION_FLOWS[data.type];
  const from = data.fromAccountId
    ? await loadAccount(tx, userId, data.fromAccountId, "fromAccountId", existing?.fromAccountId)
    : null;
  const to = data.toAccountId
    ? await loadAccount(tx, userId, data.toAccountId, "toAccountId", existing?.toAccountId)
    : null;
  if (from) assertKind(from, flow.fromKind, "fromAccountId");
  if (to) assertKind(to, flow.toKind, "toAccountId");
  if (data.categoryId) await assertCategory(tx, userId, data.categoryId, flow.categoryType);

  // Trading money must be attributed to the trading account's owner.
  const tradingAccount = [from, to].find((a) => a?.type === "TRADING");
  if (flow.fromKind === "TRADING" || flow.toKind === "TRADING") {
    if (tradingAccount && tradingAccount.owner !== data.owner) {
      throw fieldError(
        "owner",
        `Owner must be ${OWNER_LABELS[tradingAccount.owner]} to match ${tradingAccount.name}`,
      );
    }
  }
  return { from, to };
}

async function resolvePerson(tx: Tx, userId: string, data: TransactionData): Promise<string> {
  if (data.personId) {
    const person = await tx.person.findFirst({ where: { id: data.personId, userId }, select: { id: true } });
    if (!person) throw fieldError("personId", "Person not found");
    return person.id;
  }
  const name = data.personName!;
  const existing = await tx.person.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.person.create({ data: { userId, name }, select: { id: true } });
  return created.id;
}

const REPAYMENT_TYPES: TransactionType[] = ["LOAN_REPAYMENT", "LENT_REPAYMENT"];

/** Recomputes outstanding/status for a loan from its linked repayment transactions. */
export async function recomputeLoan(tx: Tx, loanId: string): Promise<void> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      originalAmount: true,
      transactions: { where: { type: { in: REPAYMENT_TYPES } }, select: { amount: true } },
    },
  });
  if (!loan) return;
  const outstanding = computeLoanOutstanding(loan.originalAmount, loan.transactions);
  await tx.loan.update({
    where: { id: loan.id },
    data: { outstandingAmount: outstanding.toFixed(2), status: loanStatusFor(outstanding) },
  });
}

async function loadLoanForRepayment(
  tx: Tx,
  userId: string,
  loanId: string,
  type: TransactionType,
  excludeTransactionId?: string,
) {
  const loan = await tx.loan.findFirst({
    where: { id: loanId, userId },
    select: {
      id: true,
      direction: true,
      originalAmount: true,
      transactions: {
        where: { type: { in: REPAYMENT_TYPES }, ...(excludeTransactionId ? { id: { not: excludeTransactionId } } : {}) },
        select: { amount: true },
      },
    },
  });
  if (!loan) throw fieldError("loanId", "Loan not found");
  const expectedType = REPAYMENT_TYPE_FOR_DIRECTION[loan.direction];
  if (expectedType !== type) {
    throw fieldError(
      "type",
      `This loan needs a "${TRANSACTION_TYPE_LABELS[expectedType]}" transaction, not "${TRANSACTION_TYPE_LABELS[type]}"`,
    );
  }
  const outstanding = computeLoanOutstanding(loan.originalAmount, loan.transactions);
  return { loan, outstanding };
}

function baseData(userId: string, data: TransactionData) {
  return {
    userId,
    type: data.type,
    amount: data.amount,
    owner: data.owner,
    paymentMode: data.paymentMode,
    notes: data.notes,
    transactionDate: fromDateOnly(data.transactionDate),
    categoryId: data.categoryId,
    fromAccountId: data.fromAccountId,
    toAccountId: data.toAccountId,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createTransaction(userId: string, input: unknown): Promise<{ id: string; loanId: string | null }> {
  const data = parseTransactionInput(input);
  const flow = TRANSACTION_FLOWS[data.type];

  return prisma.$transaction(async (tx) => {
    await validateStructure(tx, userId, data);

    let loanId: string | null = null;

    if (flow.loan === "creates") {
      const personId = await resolvePerson(tx, userId, data);
      const direction = LOAN_DIRECTION_FOR_TYPE[data.type] as LoanDirection;
      const loan = await tx.loan.create({
        data: {
          userId,
          personId,
          direction,
          originalAmount: data.amount,
          outstandingAmount: data.amount,
          status: "ACTIVE",
          notes: data.notes,
          startDate: fromDateOnly(data.transactionDate),
        },
        select: { id: true },
      });
      loanId = loan.id;
    } else if (flow.loan === "repays") {
      const { loan, outstanding } = await loadLoanForRepayment(tx, userId, data.loanId!, data.type);
      const err = validateRepaymentAmount(outstanding, data.amount);
      if (err) throw fieldError("amount", err);
      loanId = loan.id;
    }

    const created = await tx.transaction.create({
      data: { ...baseData(userId, data), loanId },
      select: { id: true },
    });

    if (flow.loan === "repays" && loanId) await recomputeLoan(tx, loanId);

    return { id: created.id, loanId };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export async function updateTransaction(userId: string, id: string, input: unknown): Promise<{ id: string }> {
  const data = parseTransactionInput(input);
  const newFlow = TRANSACTION_FLOWS[data.type];

  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id, userId },
      include: {
        loan: {
          select: {
            id: true,
            direction: true,
            personId: true,
            originalAmount: true,
            transactions: { where: { type: { in: REPAYMENT_TYPES } }, select: { id: true, amount: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundError("Transaction");

    await validateStructure(tx, userId, data, existing);

    const oldFlow = TRANSACTION_FLOWS[existing.type];
    let loanId: string | null = null;
    let loanToDelete: string | null = null;
    const loansToRecompute = new Set<string>();

    // --- Old transaction created a loan ---------------------------------
    if (oldFlow.loan === "creates" && existing.loan) {
      const loan = existing.loan;
      const sameDirection = newFlow.loan === "creates" && LOAN_DIRECTION_FOR_TYPE[data.type] === loan.direction;
      if (sameDirection) {
        const repaid = sum(loan.transactions.map((t) => t.amount));
        const err = validateOriginalAmountChange(data.amount, repaid);
        if (err) throw fieldError("amount", err);
        const personId = data.personId || data.personName ? await resolvePerson(tx, userId, data) : loan.personId;
        const outstanding = toDecimal(data.amount).minus(repaid);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            personId,
            originalAmount: data.amount,
            outstandingAmount: outstanding.toFixed(2),
            status: loanStatusFor(outstanding),
            notes: data.notes,
            startDate: fromDateOnly(data.transactionDate),
          },
        });
        loanId = loan.id;
      } else {
        if (loan.transactions.length > 0) {
          throw new AppError(
            "This loan already has repayments. Delete the repayments first, or keep the transaction type unchanged.",
          );
        }
        loanToDelete = loan.id;
        // Fall through: the new type may create a new loan or link a repayment below.
      }
    }

    // --- Old transaction was a repayment -------------------------------
    if (oldFlow.loan === "repays" && existing.loanId) {
      loansToRecompute.add(existing.loanId);
    }

    // --- New transaction semantics -------------------------------------
    if (newFlow.loan === "creates" && !loanId) {
      const personId = await resolvePerson(tx, userId, data);
      const direction = LOAN_DIRECTION_FOR_TYPE[data.type] as LoanDirection;
      const loan = await tx.loan.create({
        data: {
          userId,
          personId,
          direction,
          originalAmount: data.amount,
          outstandingAmount: data.amount,
          status: "ACTIVE",
          notes: data.notes,
          startDate: fromDateOnly(data.transactionDate),
        },
        select: { id: true },
      });
      loanId = loan.id;
    } else if (newFlow.loan === "repays") {
      const { loan, outstanding } = await loadLoanForRepayment(tx, userId, data.loanId!, data.type, existing.id);
      const err = validateRepaymentAmount(outstanding, data.amount);
      if (err) throw fieldError("amount", err);
      loanId = loan.id;
      loansToRecompute.add(loan.id);
    }

    await tx.transaction.update({
      where: { id: existing.id },
      data: { ...baseData(userId, data), loanId },
    });

    if (loanToDelete) await tx.loan.delete({ where: { id: loanToDelete } });
    for (const lid of loansToRecompute) {
      if (lid !== loanToDelete) await recomputeLoan(tx, lid);
    }

    return { id: existing.id };
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteTransaction(userId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id, userId },
      select: {
        id: true,
        type: true,
        loanId: true,
        loan: { select: { id: true, _count: { select: { transactions: true } } } },
        installment: { select: { id: true } },
      },
    });
    if (!existing) throw new NotFoundError("Transaction");

    // A transaction created by paying a plan instalment: returning it to pending keeps
    // the plan honest. The relation alone would only null the id and leave it "paid".
    if (existing.installment) {
      await tx.installment.update({
        where: { id: existing.installment.id },
        data: { status: "PENDING", paidDate: null, transactionId: null },
      });
    }

    const flow = TRANSACTION_FLOWS[existing.type];

    if (flow.loan === "creates" && existing.loan) {
      // The loan's own transactions include this one; anything more means repayments exist.
      if (existing.loan._count.transactions > 1) {
        throw new AppError("This loan has repayments recorded. Delete the repayments first.");
      }
      await tx.transaction.delete({ where: { id: existing.id } });
      await tx.loan.delete({ where: { id: existing.loan.id } });
      return;
    }

    await tx.transaction.delete({ where: { id: existing.id } });
    if (flow.loan === "repays" && existing.loanId) await recomputeLoan(tx, existing.loanId);
  }, TX_OPTIONS);
}
