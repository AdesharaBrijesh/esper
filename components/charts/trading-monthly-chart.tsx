"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addMonths, formatMonthKey, todayDateOnly } from "@/lib/dates";
import { formatINR, toDecimal, ZERO } from "@/lib/money";
import type { TransactionDTO } from "@/lib/types";

interface Point {
  month: string;
  label: string;
  profit: number;
  loss: number;
  net: number;
}

/** Monthly profit vs loss (last N months) derived client-side from trading transactions. */
export function TradingMonthlyChart({ transactions, months = 6 }: { transactions: TransactionDTO[]; months?: number }) {
  const data = useMemo<Point[]>(() => {
    const today = todayDateOnly();
    const keys: string[] = [];
    for (let i = months - 1; i >= 0; i--) keys.push(addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));
    const map = new Map(keys.map((k) => [k, { profit: ZERO, loss: ZERO }]));
    for (const t of transactions) {
      const row = map.get(t.transactionDate.slice(0, 7));
      if (!row) continue;
      if (t.type === "TRADING_PROFIT") row.profit = row.profit.plus(toDecimal(t.amount));
      else if (t.type === "TRADING_LOSS") row.loss = row.loss.plus(toDecimal(t.amount));
    }
    return keys.map((k) => {
      const r = map.get(k)!;
      return {
        month: k,
        label: formatMonthKey(k).replace(/ \d{4}$/, ""),
        profit: Number(r.profit.toFixed(2)),
        loss: -Number(r.loss.toFixed(2)),
        net: Number(r.profit.minus(r.loss).toFixed(2)),
      };
    });
  }, [transactions, months]);

  const empty = data.every((d) => d.profit === 0 && d.loss === 0);
  if (empty) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No profit or loss recorded in the last {months} months.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => formatINR(v, { compact: true }).replace("₹", "₹")}
            />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              formatter={(value, name) => [formatINR(Math.abs(Number(value))), name === "profit" ? "Profit" : "Loss"]}
              contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
            <Bar dataKey="profit" stackId="pl" fill="var(--income)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="loss" stackId="pl" fill="var(--expense)" radius={[0, 0, 6, 6]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-income" aria-hidden /> Profit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-expense" aria-hidden /> Loss
        </span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Monthly numbers</summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Month</th>
              <th className="py-1 text-right font-medium">Profit</th>
              <th className="py-1 text-right font-medium">Loss</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((d) => (
              <tr key={d.month} className="border-t">
                <td className="py-1">{formatMonthKey(d.month)}</td>
                <td className="py-1 text-right text-income">{formatINR(d.profit)}</td>
                <td className="py-1 text-right text-expense">{formatINR(-d.loss)}</td>
                <td className="py-1 text-right font-medium">{formatINR(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
