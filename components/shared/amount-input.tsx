import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Prominent rupee amount input. Text input with a decimal keyboard on phones;
 * validation happens in Zod (moneyString). Works with react-hook-form register().
 */
export function AmountInput({
  className,
  size = "lg",
  invalid,
  ...props
}: Omit<React.ComponentProps<"input">, "size" | "type"> & {
  size?: "default" | "lg" | "xl";
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-semibold text-muted-foreground",
          size === "xl" ? "text-2xl" : size === "lg" ? "text-lg" : "text-base",
        )}
      >
        ₹
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        aria-invalid={invalid || undefined}
        className={cn(
          "tabular w-full rounded-xl border border-input bg-background pr-4 pl-10 font-semibold outline-none transition-colors",
          "placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
          size === "xl" ? "h-16 text-3xl" : size === "lg" ? "h-14 text-2xl" : "h-11 text-base",
          className,
        )}
        {...props}
      />
    </div>
  );
}
