"use client";

import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * Horizontal pill selector (scrolls on small screens). Plain buttons, no library.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "default",
  fullWidth = false,
  "aria-label": ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "default" | "lg";
  fullWidth?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "scrollbar-none flex gap-1 overflow-x-auto rounded-xl bg-muted p-1",
        fullWidth ? "w-full" : "w-fit max-w-full",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors outline-none select-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              size === "sm" ? "h-8 px-3 text-xs" : size === "lg" ? "h-11 px-4 text-sm" : "h-9 px-3.5 text-sm",
              fullWidth && "flex-1",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
