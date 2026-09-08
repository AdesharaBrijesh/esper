import { Decimal, toDecimal, ZERO, type MoneyInput } from "@/lib/money";
import type { LoanDirection, LoanStatus } from "@/generated/prisma/enums";

/**
 * Loan rules.
 *
 *  BORROW  -> creates a loan with direction BORROWED (you owe)
 *  LEND    -> creates a loan with direction LENT (owed to you)
 *  LOAN_REPAYMENT / LENT_REPAYMENT -> reduce outstanding; never below zero.
 *
 * outstanding = originalAmount - sum(repayments)
 * status      = PAID when outstanding <= 0, else ACTIVE
 */
export interface RepaymentLike {
  amount: MoneyInput;
}

export function computeLoanOutstanding(originalAmount: MoneyInput, repayments: Iterable<RepaymentLike>): Decimal {
  let outstanding = toDecimal(originalAmount);
  for (const r of repayments) outstanding = outstanding.minus(toDecimal(r.amount));
  return outstanding;
}

export function loanStatusFor(outstanding: MoneyInput): LoanStatus {
  return toDecimal(outstanding).lessThanOrEqualTo(0) ? "PAID" : "ACTIVE";
}

/**
 * Returns an error message when `amount` cannot be repaid against `outstanding`, else null.
 */
export function validateRepaymentAmount(outstanding: MoneyInput, amount: MoneyInput): string | null {
  const out = toDecimal(outstanding);
  const amt = toDecimal(amount);
  if (!amt.greaterThan(0)) return "Repayment amount must be greater than 0.";
  if (out.lessThanOrEqualTo(0)) return "This loan is already fully settled.";
  if (amt.greaterThan(out)) return `Repayment cannot exceed the outstanding amount (${out.toFixed(2)}).`;
  return null;
}

/**
 * Validates that a loan's original amount can be changed to `newOriginal`
 * given the repayments already recorded. Returns error message or null.
 */
export function validateOriginalAmountChange(newOriginal: MoneyInput, repaidSoFar: MoneyInput): string | null {
  const next = toDecimal(newOriginal);
  const repaid = toDecimal(repaidSoFar);
  if (!next.greaterThan(0)) return "Loan amount must be greater than 0.";
  if (next.lessThan(repaid)) return `Loan amount cannot be less than what was already repaid (${repaid.toFixed(2)}).`;
  return null;
}

export interface LoanLike {
  direction: LoanDirection;
  outstandingAmount: MoneyInput;
  status?: LoanStatus;
}

export interface LoanTotals {
  /** Total you still owe to others. */
  youOwe: Decimal;
  /** Total others still owe you. */
  owedToYou: Decimal;
  /** owedToYou - youOwe */
  net: Decimal;
}

export function summarizeLoans(loans: Iterable<LoanLike>): LoanTotals {
  let youOwe = ZERO;
  let owedToYou = ZERO;
  for (const l of loans) {
    const out = toDecimal(l.outstandingAmount);
    if (out.lessThanOrEqualTo(0)) continue;
    if (l.direction === "BORROWED") youOwe = youOwe.plus(out);
    else owedToYou = owedToYou.plus(out);
  }
  return { youOwe, owedToYou, net: owedToYou.minus(youOwe) };
}

export interface PersonLoanSummary {
  personId: string;
  personName: string;
  youOwe: Decimal;
  owedToYou: Decimal;
  /** Positive when they owe you more than you owe them. */
  net: Decimal;
  activeLoans: number;
}

export function summarizeLoansByPerson(
  loans: Iterable<LoanLike & { personId: string; personName: string }>,
): PersonLoanSummary[] {
  const byPerson = new Map<string, PersonLoanSummary>();
  for (const l of loans) {
    let s = byPerson.get(l.personId);
    if (!s) {
      s = { personId: l.personId, personName: l.personName, youOwe: ZERO, owedToYou: ZERO, net: ZERO, activeLoans: 0 };
      byPerson.set(l.personId, s);
    }
    const out = toDecimal(l.outstandingAmount);
    if (out.lessThanOrEqualTo(0)) continue;
    s.activeLoans += 1;
    if (l.direction === "BORROWED") s.youOwe = s.youOwe.plus(out);
    else s.owedToYou = s.owedToYou.plus(out);
    s.net = s.owedToYou.minus(s.youOwe);
  }
  return [...byPerson.values()].sort((a, b) => a.personName.localeCompare(b.personName));
}
