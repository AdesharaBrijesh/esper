import { describe, expect, it } from "vitest";
import { isTradingType, summarizeTrading, summarizeTradingByOwner } from "@/lib/calculations/trading";
import type { TradingTransactionLike } from "@/lib/calculations/trading";

const rows: TradingTransactionLike[] = [
  { type: "TRADING_DEPOSIT", amount: "20000", owner: "SELF" },
  { type: "TRADING_PROFIT", amount: "3000", owner: "SELF" },
  { type: "TRADING_LOSS", amount: "2000", owner: "SELF" },
  { type: "TRADING_WITHDRAWAL", amount: "5000", owner: "SELF" },
  { type: "TRADING_DEPOSIT", amount: "50000", owner: "BROTHER" },
  { type: "TRADING_PROFIT", amount: "7500.50", owner: "BROTHER" },
  { type: "EXPENSE", amount: "999", owner: "SELF" },
  { type: "TRANSFER", amount: "999", owner: "BROTHER" },
];

describe("summarizeTrading", () => {
  it("sums deposits, withdrawals, profit and loss for all owners", () => {
    const s = summarizeTrading(rows, "ALL");
    expect(s.deposits.toFixed(2)).toBe("70000.00");
    expect(s.withdrawals.toFixed(2)).toBe("5000.00");
    expect(s.profit.toFixed(2)).toBe("10500.50");
    expect(s.loss.toFixed(2)).toBe("2000.00");
    expect(s.netResult.toFixed(2)).toBe("8500.50");
    expect(s.netInvested.toFixed(2)).toBe("65000.00");
    expect(s.profitCount).toBe(2);
    expect(s.lossCount).toBe(1);
  });

  it("filters by owner and never mixes balances", () => {
    const self = summarizeTrading(rows, "SELF");
    expect(self.deposits.toFixed(2)).toBe("20000.00");
    expect(self.netResult.toFixed(2)).toBe("1000.00");
    expect(self.netInvested.toFixed(2)).toBe("15000.00");

    const bro = summarizeTrading(rows, "BROTHER");
    expect(bro.deposits.toFixed(2)).toBe("50000.00");
    expect(bro.withdrawals.toFixed(2)).toBe("0.00");
    expect(bro.netResult.toFixed(2)).toBe("7500.50");
  });

  it("ignores non-trading transaction types", () => {
    const s = summarizeTrading([{ type: "EXPENSE", amount: "100", owner: "SELF" }]);
    expect(s.deposits.isZero()).toBe(true);
    expect(s.netResult.isZero()).toBe(true);
  });

  it("summarizeTradingByOwner returns per-owner and combined summaries", () => {
    const by = summarizeTradingByOwner(rows);
    expect(by.ALL.deposits.toFixed(2)).toBe("70000.00");
    expect(by.SELF.deposits.plus(by.BROTHER.deposits).toFixed(2)).toBe(by.ALL.deposits.toFixed(2));
  });

  it("isTradingType identifies the four trading types", () => {
    expect(isTradingType("TRADING_DEPOSIT")).toBe(true);
    expect(isTradingType("TRADING_LOSS")).toBe(true);
    expect(isTradingType("EXPENSE")).toBe(false);
    expect(isTradingType("TRANSFER")).toBe(false);
  });
});
