"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/money";

export interface MonthlyPointLike {
  month: string;
  label: string;
  income: string;
  expense: string;
  net: string;
}

const tooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

/** Grouped bars of income vs expense per month, with a table for screen readers / quick scanning. */
export function MonthlyTrendChart({ data, height = 240 }: { data: MonthlyPointLike[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, incomeN: Number(d.income), expenseN: Number(d.expense) }));
  const empty = rows.every((r) => r.incomeN === 0 && r.expenseN === 0);
  if (empty) return <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded in this period.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={60}
              tickFormatter={(v: number) => formatINR(v, { compact: true })}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              formatter={(value, name) => [formatINR(Number(value)), name === "incomeN" ? "Income" : "Expenses"]}
              contentStyle={tooltipStyle}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
            <Legend formatter={(v) => (v === "incomeN" ? "Income" : "Expenses")} wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="incomeN" fill="var(--income)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="expenseN" fill="var(--expense)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">Month</th>
              <th className="py-1 text-right font-medium">Income</th>
              <th className="py-1 text-right font-medium">Expenses</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => (
              <tr key={r.month} className="border-t">
                <td className="py-1">{r.label}</td>
                <td className="py-1 text-right text-income">{formatINR(r.income)}</td>
                <td className="py-1 text-right text-expense">{formatINR(r.expense)}</td>
                <td className="py-1 text-right font-medium">{formatINR(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
