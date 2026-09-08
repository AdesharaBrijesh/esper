import { describe, expect, it } from "vitest";
import {
  accountDelta,
  applyTransaction,
  balancesFromAggregates,
  computeAccountBalances,
  totalBalance,
  type BalanceTransaction,
} from "@/lib/calculations/balances";
import { Decimal } from "@/lib/money";

const CASH = "cash";
const BANK = "bank";
const TRADING = "trading";
const BRO_TRADING = "bro-trading";

const accounts = [
  { id: CASH, openingBalance: "1000.00", owner: "SELF" as const, isActive: true },
  { id: BANK, openingBalance: "20000.00", owner: "SELF" as const, isActive: true },
  { id: TRADING, openingBalance: "0", owner: "SELF" as const, isActive: true },
  { id: BRO_TRADING, openingBalance: "0", owner: "BROTHER" as const, isActive: true },
];

const txn = (amount: string, from: string | null, to: string | null): BalanceTransaction => ({
  amount,
  fromAccountId: from,
  toAccountId: to,
});

const bal = (m: Map<string, Decimal>, id: string) => m.get(id)!.toFixed(2);

describe("computeAccountBalances", () => {
  it("starts from opening balances with no transactions", () => {
    const b = computeAccountBalances(accounts, []);
    expect(bal(b, CASH)).toBe("1000.00");
    expect(bal(b, BANK)).toBe("20000.00");
  });

  it("income increases the destination account", () => {
    const b = computeAccountBalances(accounts, [txn("10000", null, BANK)]);
    expect(bal(b, BANK)).toBe("30000.00");
    expect(bal(b, CASH)).toBe("1000.00");
  });

  it("expense decreases the source account", () => {
    const b = computeAccountBalances(accounts, [txn("250.50", CASH, null)]);
    expect(bal(b, CASH)).toBe("749.50");
  });

  it("transfer moves money between accounts without changing total", () => {
    const b = computeAccountBalances(accounts, [txn("5000", CASH, BANK)]);
    expect(bal(b, CASH)).toBe("-4000.00");
    expect(bal(b, BANK)).toBe("25000.00");
    expect(totalBalance(b, accounts).toFixed(2)).toBe("21000.00");
  });

  it("trading deposit moves bank money into trading", () => {
    const b = computeAccountBalances(accounts, [txn("20000", BANK, TRADING)]);
    expect(bal(b, BANK)).toBe("0.00");
    expect(bal(b, TRADING)).toBe("20000.00");
  });

  it("trading withdrawal moves trading money back to bank", () => {
    const b = computeAccountBalances(accounts, [txn("20000", BANK, TRADING), txn("5000", TRADING, BANK)]);
    expect(bal(b, BANK)).toBe("5000.00");
    expect(bal(b, TRADING)).toBe("15000.00");
  });

  it("trading profit increases the trading account", () => {
    const b = computeAccountBalances(accounts, [txn("20000", BANK, TRADING), txn("3000", null, TRADING)]);
    expect(bal(b, TRADING)).toBe("23000.00");
  });

  it("trading loss decreases the trading account", () => {
    const b = computeAccountBalances(accounts, [txn("20000", BANK, TRADING), txn("2000", TRADING, null)]);
    expect(bal(b, TRADING)).toBe("18000.00");
  });

  it("borrow increases cash, loan repayment decreases it", () => {
    const b = computeAccountBalances(accounts, [txn("5000", null, CASH), txn("2000", CASH, null)]);
    expect(bal(b, CASH)).toBe("4000.00");
  });

  it("lend decreases cash, repayment received increases it", () => {
    const b = computeAccountBalances(accounts, [txn("3000", CASH, null), txn("1000", null, CASH)]);
    expect(bal(b, CASH)).toBe("-1000.00");
  });

  it("keeps owners separate", () => {
    const b = computeAccountBalances(accounts, [
      txn("50000", null, BRO_TRADING),
      txn("5000", null, BRO_TRADING),
      txn("20000", BANK, TRADING),
    ]);
    expect(totalBalance(b, accounts, { owner: "BROTHER" }).toFixed(2)).toBe("55000.00");
    expect(totalBalance(b, accounts, { owner: "SELF" }).toFixed(2)).toBe("21000.00");
    expect(totalBalance(b, accounts, { owner: "ALL" }).toFixed(2)).toBe("76000.00");
  });

  it("ignores transactions referencing unknown accounts", () => {
    const b = computeAccountBalances(accounts, [txn("100", "ghost", null), txn("100", null, "ghost")]);
    expect(totalBalance(b, accounts).toFixed(2)).toBe("21000.00");
  });

  it("uses exact decimal arithmetic", () => {
    const b = computeAccountBalances([{ id: CASH, openingBalance: "0" }], [
      txn("0.10", null, CASH),
      txn("0.20", null, CASH),
      txn("0.30", CASH, null),
    ]);
    expect(bal(b, CASH)).toBe("0.00");
  });

  it("excludes inactive accounts from totals unless requested", () => {
    const accts = [...accounts, { id: "old", openingBalance: "999", owner: "SELF" as const, isActive: false }];
    const b = computeAccountBalances(accts, []);
    expect(totalBalance(b, accts).toFixed(2)).toBe("21000.00");
    expect(totalBalance(b, accts, { includeInactive: true }).toFixed(2)).toBe("21999.00");
  });
});

describe("accountDelta / applyTransaction", () => {
  it("returns signed delta for the given account", () => {
    const t = txn("100", CASH, BANK);
    expect(accountDelta(t, CASH).toFixed(2)).toBe("-100.00");
    expect(accountDelta(t, BANK).toFixed(2)).toBe("100.00");
    expect(accountDelta(t, TRADING).toFixed(2)).toBe("0.00");
  });

  it("applyTransaction mutates the map in place", () => {
    const m = new Map([[CASH, new Decimal(10)]]);
    applyTransaction(m, txn("4", CASH, null));
    expect(m.get(CASH)!.toFixed(2)).toBe("6.00");
  });
});

describe("balancesFromAggregates", () => {
  it("matches the transaction-by-transaction computation", () => {
    const txns = [txn("10000", null, BANK), txn("250", CASH, null), txn("5000", CASH, BANK), txn("20000", BANK, TRADING)];
    const expected = computeAccountBalances(accounts, txns);

    const incoming = new Map<string, string>();
    const outgoing = new Map<string, string>();
    for (const t of txns) {
      if (t.toAccountId) incoming.set(t.toAccountId, new Decimal(incoming.get(t.toAccountId) ?? 0).plus(String(t.amount)).toFixed(2));
      if (t.fromAccountId) outgoing.set(t.fromAccountId, new Decimal(outgoing.get(t.fromAccountId) ?? 0).plus(String(t.amount)).toFixed(2));
    }
    const actual = balancesFromAggregates(accounts, incoming, outgoing);
    for (const a of accounts) expect(bal(actual, a.id)).toBe(bal(expected, a.id));
  });
});
