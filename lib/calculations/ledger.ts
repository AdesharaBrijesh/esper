import { Decimal, toDecimal, ZERO, type MoneyInput } from "@/lib/money";
import { PERSON_BALANCE_SIGN } from "@/lib/constants";
import type { TransactionType } from "@/generated/prisma/enums";

/**
 * People ledger rules.
 *
 * Every money movement with a person is a transaction carrying that person:
 *   GAVE (and the legacy LEND / LOAN_REPAYMENT)        -> balance goes up
 *   GOT  (and the legacy BORROW / LENT_REPAYMENT)      -> balance goes down
 *
 * balance > 0  they owe you that much
 * balance < 0  you owe them that much
 * balance = 0  settled
 *
 * There is no per-loan bookkeeping to keep in sync: the balance is a plain sum, so
 * editing or deleting any entry is always safe.
 */
export interface LedgerTxLike {
  type: TransactionType;
  amount: MoneyInput;
}

/** Signed effect of one transaction on a person's balance (0 for unrelated types). */
export function personBalanceDelta(t: LedgerTxLike): Decimal {
  const sign = PERSON_BALANCE_SIGN[t.type];
  if (!sign) return ZERO;
  const amount = toDecimal(t.amount);
  return sign === 1 ? amount : amount.negated();
}

export interface PersonBalance {
  /** Positive: they owe you. Negative: you owe them. */
  balance: Decimal;
  /** Total you handed them. */
  gave: Decimal;
  /** Total they handed you. */
  got: Decimal;
}

export function personBalance(entries: Iterable<LedgerTxLike>): PersonBalance {
  let gave = ZERO;
  let got = ZERO;
  for (const t of entries) {
    const delta = personBalanceDelta(t);
    if (delta.greaterThan(0)) gave = gave.plus(delta);
    else if (delta.lessThan(0)) got = got.plus(delta.abs());
  }
  return { balance: gave.minus(got), gave, got };
}

export type BalanceStanding = "owes-you" | "you-owe" | "settled";

export function balanceStanding(balance: MoneyInput): BalanceStanding {
  const d = toDecimal(balance);
  if (d.greaterThan(0)) return "owes-you";
  if (d.lessThan(0)) return "you-owe";
  return "settled";
}

export interface LedgerTotals {
  /** Sum of everything you still have to pay back, across every person you owe. */
  toPay: Decimal;
  /** Sum of everything others still have to pay you. */
  toReceive: Decimal;
  /** toReceive - toPay */
  net: Decimal;
  peopleToPay: number;
  peopleToReceive: number;
}

/**
 * Totals across people. Each person is netted first, so a friend you lent 500 and
 * borrowed 200 from counts once, as 300 owed to you — never as both.
 */
export function ledgerTotals(balances: Iterable<MoneyInput>): LedgerTotals {
  let toPay = ZERO;
  let toReceive = ZERO;
  let peopleToPay = 0;
  let peopleToReceive = 0;
  for (const b of balances) {
    const d = toDecimal(b);
    if (d.greaterThan(0)) {
      toReceive = toReceive.plus(d);
      peopleToReceive += 1;
    } else if (d.lessThan(0)) {
      toPay = toPay.plus(d.abs());
      peopleToPay += 1;
    }
  }
  return { toPay, toReceive, net: toReceive.minus(toPay), peopleToPay, peopleToReceive };
}

/**
 * Running balance after each entry. `entries` must be oldest first; the result is in
 * the same order, so callers usually reverse it for display.
 */
export function withRunningBalance<T extends LedgerTxLike>(entries: readonly T[]): (T & { runningBalance: Decimal })[] {
  let running = ZERO;
  return entries.map((e) => {
    running = running.plus(personBalanceDelta(e));
    return { ...e, runningBalance: running };
  });
}
