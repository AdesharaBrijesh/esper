import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";

/**
 * Compact KPI tile: label, money value and optional hint.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "auto",
  icon,
  className,
  compact,
}: {
  label: string;
  value: string | number;
  hint?: React.ReactNode;
  tone?: "auto" | "neutral" | "income" | "expense" | "muted";
  icon?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-2xl border bg-card p-3.5 text-card-foreground", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-base leading-none" aria-hidden>{icon}</span> : null}
      </div>
      <Money value={value} tone={tone} compact={compact} className="text-lg font-semibold md:text-xl" />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
