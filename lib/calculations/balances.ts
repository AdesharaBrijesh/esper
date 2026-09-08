import { Decimal, toDecimal, ZERO, type MoneyInput } from "@/lib/money";
import type { Owner } from "@/generated/prisma/enums";

/**
 * Account balance rules.
 *
 * Every transaction moves `amount` FROM `fromAccountId` (balance decreases)
 * TO `toAccountId` (balance increases). Either side may be null:
 *
 *  EXPENSE            from -> outside
 *  INCOME             outside -> to
 *  TRANSFER           from -> to
 *  TRADING_DEPOSIT    from (bank/cash) -> to (trading)
 *  TRADING_WITHDRAWAL from (trading) -> to (bank/cash)
 *  TRADING_PROFIT     outside -> to (trading)
 *  TRADING_LOSS       from (trading) -> outside
 *  BORROW             person -> to
 *  LEND               from -> person
 *  LOAN_REPAYMENT     from -> person
 *  LENT_REPAYMENT     person -> to
 *
 * balance = openingBalance + sum(incoming) - sum(outgoing)
 */
export interface BalanceAccount {
  id: string;
  openingBalance: MoneyInput;
  owner?: Owner;
  isActive?: boolean;
}

export interface BalanceTransaction {
  amount: MoneyInput;
  fromAccountId: string | null;
  toAccountId: string | null;
}

/** Signed effect of one transaction on one account. */
export function accountDelta(txn: BalanceTransaction, accountId: string): Decimal {
  const amount = toDecimal(txn.amount);
  let delta = ZERO;
  if (txn.toAccountId === accountId) delta = delta.plus(amount);
  if (txn.fromAccountId === accountId) delta = delta.minus(amount);
  return delta;
}

/** Mutates `balances` by applying a single transaction. Unknown accounts are ignored. */
export function applyTransaction(balances: Map<string, Decimal>, txn: BalanceTransaction): void {
  const amount = toDecimal(txn.amount);
  if (txn.toAccountId && balances.has(txn.toAccountId)) {
    balances.set(txn.toAccountId, balances.get(txn.toAccountId)!.plus(amount));
  }
  if (txn.fromAccountId && balances.has(txn.fromAccountId)) {
    balances.set(txn.fromAccountId, balances.get(txn.fromAccountId)!.minus(amount));
  }
}

/** Derives current balances for all given accounts from their opening balance and transactions. */
export function computeAccountBalances(
  accounts: readonly BalanceAccount[],
  transactions: Iterable<BalanceTransaction>,
): Map<string, Decimal> {
  const balances = new Map<string, Decimal>();
  for (const a of accounts) balances.set(a.id, toDecimal(a.openingBalance));
  for (const t of transactions) applyTransaction(balances, t);
  return balances;
}

/**
 * Applies pre-aggregated sums (from a GROUP BY query) instead of raw transactions.
 * `incoming[accountId]` = SUM(amount) where toAccountId = accountId, etc.
 */
export function balancesFromAggregates(
  accounts: readonly BalanceAccount[],
  incoming: ReadonlyMap<string, MoneyInput>,
  outgoing: ReadonlyMap<string, MoneyInput>,
): Map<string, Decimal> {
  const balances = new Map<string, Decimal>();
  for (const a of accounts) {
    const opening = toDecimal(a.openingBalance);
    const inc = toDecimal(incoming.get(a.id));
    const out = toDecimal(outgoing.get(a.id));
    balances.set(a.id, opening.plus(inc).minus(out));
  }
  return balances;
}

/** Total of balances for the accounts matching the optional filter (default: all active accounts). */
export function totalBalance(
  balances: ReadonlyMap<string, Decimal>,
  accounts: readonly BalanceAccount[],
  filter?: { owner?: Owner | "ALL"; includeInactive?: boolean },
): Decimal {
  let total = ZERO;
  for (const a of accounts) {
    if (!filter?.includeInactive && a.isActive === false) continue;
    if (filter?.owner && filter.owner !== "ALL" && a.owner !== filter.owner) continue;
    total = total.plus(balances.get(a.id) ?? ZERO);
  }
  return total;
}
