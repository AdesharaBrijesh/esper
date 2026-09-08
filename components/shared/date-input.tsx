import * as React from "react";
import { cn } from "@/lib/utils";

/** Native date input ("YYYY-MM-DD"), styled like our other controls. Works with register(). */
export function DateInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="date"
      className={cn(
        "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30",
        "[&::-webkit-calendar-picker-indicator]:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
