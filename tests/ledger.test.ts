import { describe, expect, it } from "vitest";
import { balanceStanding, ledgerTotals, personBalance, personBalanceDelta, withRunningBalance } from "@/lib/calculations/ledger";

describe("people ledger", () => {
  it("GAVE raises and GOT lowers the balance; unrelated types do nothing", () => {
    expect(personBalanceDelta({ type: "GAVE", amount: "500" }).toFixed(2)).toBe("500.00");
    expect(personBalanceDelta({ type: "GOT", amount: "200" }).toFixed(2)).toBe("-200.00");
    expect(personBalanceDelta({ type: "EXPENSE", amount: "200" }).toFixed(2)).toBe("0.00");
  });

  it("counts the legacy loan types the same way", () => {
    const b = personBalance([
      { type: "BORROW", amount: "5000" }, // they gave you 5000
      { type: "LOAN_REPAYMENT", amount: "2000" }, // you paid 2000 back
      { type: "LEND", amount: "300" }, // you lent 300
      { type: "LENT_REPAYMENT", amount: "100" }, // they returned 100
    ]);
    // You owe 5000 - 2000 = 3000; they owe 300 - 100 = 200; net you owe 2800.
    expect(b.balance.toFixed(2)).toBe("-2800.00");
    expect(b.gave.toFixed(2)).toBe("2300.00");
    expect(b.got.toFixed(2)).toBe("5100.00");
  });

  it("nets each person before totalling, so nobody is counted on both sides", () => {
    const t = ledgerTotals(["-2000.00", "-5000.00", "-1000.00", "1500.00", "0.00"]);
    expect(t.toPay.toFixed(2)).toBe("8000.00");
    expect(t.toReceive.toFixed(2)).toBe("1500.00");
    expect(t.net.toFixed(2)).toBe("-6500.00");
    expect(t.peopleToPay).toBe(3);
    expect(t.peopleToReceive).toBe(1);
  });

  it("tracks the running balance after each entry", () => {
    const rows = withRunningBalance([
      { type: "GAVE" as const, amount: "500" },
      { type: "GOT" as const, amount: "800" },
      { type: "GAVE" as const, amount: "300" },
    ]);
    expect(rows.map((r) => r.runningBalance.toFixed(2))).toEqual(["500.00", "-300.00", "0.00"]);
  });

  it("describes the standing", () => {
    expect(balanceStanding("10")).toBe("owes-you");
    expect(balanceStanding("-10")).toBe("you-owe");
    expect(balanceStanding("0")).toBe("settled");
  });
});
