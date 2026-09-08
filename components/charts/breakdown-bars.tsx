import { formatINR, toDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface BreakdownRow {
  key: string;
  label: string;
  value: string;
  /** Optional 0-100 share; computed from the max value when omitted. */
  percent?: number;
  color?: string;
  hint?: string;
  href?: string;
}

/**
 * Horizontal proportional bars. Server-safe (no Recharts) – readable on any width and in dark mode.
 */
export function BreakdownBars({ rows, className, emptyMessage = "No data for this period." }: { rows: BreakdownRow[]; className?: string; emptyMessage?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(Number(toDecimal(r.value).toFixed(2)))), 0) || 1;
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {rows.map((r, i) => {
        const width = r.percent !== undefined ? r.percent : (Math.abs(Number(r.value)) / max) * 100;
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">{r.label}</span>
              <span className="tabular shrink-0">
                {formatINR(r.value)}
                {r.percent !== undefined ? <span className="ml-1.5 text-xs text-muted-foreground">{r.percent}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, Math.min(100, width))}%`, background: r.color ?? `var(--chart-${(i % 5) + 1})` }}
              />
            </div>
            {r.hint ? <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p> : null}
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <a href={r.href} className="block rounded-lg px-1 py-1 hover:bg-muted/60">
                {inner}
              </a>
            ) : (
              <div className="px-1 py-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
