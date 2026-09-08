import { Decimal, toDecimal, ZERO, type MoneyInput } from "@/lib/money";
import type { Owner, TransactionType } from "@/generated/prisma/enums";

/**
 * Trading rules.
 *
 *  TRADING_DEPOSIT     bank/cash -> trading   (capital in)
 *  TRADING_WITHDRAWAL  trading -> bank/cash   (capital out)
 *  TRADING_PROFIT      outside -> trading     (increases capital)
 *  TRADING_LOSS        trading -> outside     (decreases capital)
 *
 * netResult   = profit - loss
 * netInvested = deposits - withdrawals
 * Current trading capital is the derived balance of the trading accounts.
 */
export interface TradingTransactionLike {
  type: TransactionType;
  amount: MoneyInput;
  owner: Owner;
}

export interface TradingSummary {
  deposits: Decimal;
  withdrawals: Decimal;
  profit: Decimal;
  loss: Decimal;
  /** profit - loss */
  netResult: Decimal;
  /** deposits - withdrawals */
  netInvested: Decimal;
  profitCount: number;
  lossCount: number;
}

export const TRADING_TYPES: readonly TransactionType[] = [
  "TRADING_DEPOSIT",
  "TRADING_WITHDRAWAL",
  "TRADING_PROFIT",
  "TRADING_LOSS",
];

export function isTradingType(type: TransactionType): boolean {
  return TRADING_TYPES.includes(type);
}

export function summarizeTrading(
  transactions: Iterable<TradingTransactionLike>,
  owner: Owner | "ALL" = "ALL",
): TradingSummary {
  const s: TradingSummary = {
    deposits: ZERO,
    withdrawals: ZERO,
    profit: ZERO,
    loss: ZERO,
    netResult: ZERO,
    netInvested: ZERO,
    profitCount: 0,
    lossCount: 0,
  };
  for (const t of transactions) {
    if (owner !== "ALL" && t.owner !== owner) continue;
    const amt = toDecimal(t.amount);
    switch (t.type) {
      case "TRADING_DEPOSIT":
        s.deposits = s.deposits.plus(amt);
        break;
      case "TRADING_WITHDRAWAL":
        s.withdrawals = s.withdrawals.plus(amt);
        break;
      case "TRADING_PROFIT":
        s.profit = s.profit.plus(amt);
        s.profitCount += 1;
        break;
      case "TRADING_LOSS":
        s.loss = s.loss.plus(amt);
        s.lossCount += 1;
        break;
      default:
        break;
    }
  }
  s.netResult = s.profit.minus(s.loss);
  s.netInvested = s.deposits.minus(s.withdrawals);
  return s;
}

/** Summaries per owner plus the combined total. */
export function summarizeTradingByOwner(
  transactions: Iterable<TradingTransactionLike>,
): Record<Owner | "ALL", TradingSummary> {
  const list = [...transactions];
  return {
    ALL: summarizeTrading(list, "ALL"),
    SELF: summarizeTrading(list, "SELF"),
    BROTHER: summarizeTrading(list, "BROTHER"),
  };
}
