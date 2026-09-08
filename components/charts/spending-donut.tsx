"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface DonutSlice {
  categoryId: string;
  name: string;
  icon: string | null;
  color: string | null;
  total: string;
  count: number;
  percent: number;
}

const FALLBACK = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Donut of spending by category with the total in the centre and a legend list.
 */
export function SpendingDonut({
  data,
  total,
  height = 220,
  maxLegend = 8,
  className,
  linkQuery,
}: {
  data: DonutSlice[];
  total: string;
  height?: number;
  maxLegend?: number;
  className?: string;
  /** When set, legend rows link to `/transactions?categoryId=<id>&<linkQuery>`. */
  linkQuery?: string;
}) {
  const hrefFor = linkQuery !== undefined ? (s: DonutSlice) => `/transactions?categoryId=${s.categoryId}${linkQuery ? `&${linkQuery}` : ""}` : undefined;
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No spending recorded for this period.</p>;
  }
  const chartData = data.map((d, i) => ({ ...d, value: Number(d.total), fill: d.color ?? FALLBACK[i % FALLBACK.length] }));
  const legend = data.slice(0, maxLegend);
  const rest = data.slice(maxLegend);
  const restTotal = rest.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-center", className)}>
      <div className="relative mx-auto w-full max-w-[260px] shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {chartData.map((d) => (
                <Cell key={d.categoryId} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatINR(Number(value))}
              contentStyle={{
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground uppercase">Spent</span>
          <span className="tabular text-lg font-semibold">{formatINR(total, { compact: true })}</span>
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="Spending by category">
        {legend.map((d, i) => {
          const row = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: d.color ?? FALLBACK[i % FALLBACK.length] }} aria-hidden />
              <span className="shrink-0 text-base leading-none" aria-hidden>
                {d.icon ?? "•"}
              </span>
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="tabular text-muted-foreground">{d.percent}%</span>
              <span className="tabular w-24 text-right font-medium">{formatINR(d.total)}</span>
            </>
          );
          const cls = "flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm";
          return (
            <li key={d.categoryId}>
              {hrefFor ? (
                <a href={hrefFor(d)} className={cn(cls, "hover:bg-muted")}>
                  {row}
                </a>
              ) : (
                <div className={cls}>{row}</div>
              )}
            </li>
          );
        })}
        {rest.length > 0 ? (
          <li className="flex items-center gap-2 px-1.5 py-1 text-sm text-muted-foreground">
            <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{rest.length} more</span>
            <span className="tabular w-24 text-right">{formatINR(restTotal)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
