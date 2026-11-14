"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A label that looks like a quiet chip but opens the native picker. The select sits
 * invisibly on top, so phones get their own wheel and keyboards still work.
 */
export function ChipSelect({
  label,
  value,
  onChange,
  options,
  ariaLabel,
  tone = "default",
  dotColor,
  className,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  tone?: "default" | "warn";
  dotColor?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 max-w-full items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors focus-within:ring-3 focus-within:ring-ring/50",
        tone === "warn" ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-background text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {dotColor ? <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden /> : null}
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {value === "" ? <option value="">Choose…</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
