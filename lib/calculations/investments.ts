import { toDecimal, ZERO, type Decimal, type MoneyInput } from "@/lib/money";
import type { DateOnly } from "@/lib/dates";

/**
 * Investment maths.
 *
 * Deliberately free of price feeds. The account balance already records what was put in
 * (transfers in, minus anything redeemed). A Valuation is a dated "what is it worth
 * today" figure you type in whenever you check the app that holds it — so the gain is
 * simply value - invested, and nothing about this app depends on a market data
 * subscription that could break or start charging.
 */

export interface InvestmentLike {
  id: string;
  /** Derived account balance: net money contributed. */
  balance: MoneyInput;
  /** Most recent valuation, if one has ever been recorded. */
  latestValue?: MoneyInput | null;
  latestValueAsOf?: DateOnly | null;
}

export interface InvestmentSummary {
  invested: Decimal;
  /** Falls back to the invested amount when no valuation has been recorded yet. */
  currentValue: Decimal;
  gain: Decimal;
  /** Percentage return, or null when nothing has been invested. */
  returnPercent: number | null;
  hasValuation: boolean;
  valuedOn: DateOnly | null;
}

export function investmentSummary(item: InvestmentLike): InvestmentSummary {
  const invested = toDecimal(item.balance);
  const hasValuation = item.latestValue !== null && item.latestValue !== undefined;
  // Without a valuation the honest answer is "worth what went in", not zero.
  const currentValue = hasValuation ? toDecimal(item.latestValue) : invested;
  const gain = currentValue.minus(invested);
  const returnPercent = invested.greaterThan(0)
    ? Math.round(gain.dividedBy(invested).times(10000).toNumber()) / 100
    : null;

  return {
    invested,
    currentValue,
    gain,
    returnPercent,
    hasValuation,
    valuedOn: item.latestValueAsOf ?? null,
  };
}

export interface PortfolioTotals {
  invested: Decimal;
  currentValue: Decimal;
  gain: Decimal;
  returnPercent: number | null;
  accounts: number;
  /** True when at least one holding still has no valuation, so the total is partly at cost. */
  partiallyValued: boolean;
}

export function portfolioTotals(items: readonly InvestmentLike[]): PortfolioTotals {
  let invested = ZERO;
  let currentValue = ZERO;
  let partiallyValued = false;

  for (const item of items) {
    const summary = investmentSummary(item);
    invested = invested.plus(summary.invested);
    currentValue = currentValue.plus(summary.currentValue);
    if (!summary.hasValuation) partiallyValued = true;
  }

  const gain = currentValue.minus(invested);
  const returnPercent = invested.greaterThan(0)
    ? Math.round(gain.dividedBy(invested).times(10000).toNumber()) / 100
    : null;

  return { invested, currentValue, gain, returnPercent, accounts: items.length, partiallyValued };
}
