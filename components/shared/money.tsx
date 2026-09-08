import { formatINR, toDecimal } from "@/lib/money";
import { TRANSACTION_FLOWS, type TransactionType } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Tone = "auto" | "neutral" | "income" | "expense" | "muted";

/**
 * Formats a money string like "1250.00" as ₹1,250.00.
 * tone="auto": red when negative, default otherwise.
 */
export function Money({
  value,
  className,
  signed,
  compact,
  tone = "auto",
}: {
  value: string | number;
  className?: string;
  signed?: boolean;
  compact?: boolean;
  tone?: Tone;
}) {
  const d = toDecimal(value);
  const toneClass =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : tone === "muted"
          ? "text-muted-foreground"
          : tone === "auto" && d.isNegative() && !d.isZero()
            ? "text-expense"
            : "";
  return <span className={cn("tabular", toneClass, className)}>{formatINR(d, { signed, compact })}</span>;
}

/** Amount for a transaction row: "-₹250.00" (out), "+₹10,000.00" (in) or "₹5,000.00" (neutral). */
export function TransactionAmount({
  type,
  amount,
  className,
}: {
  type: TransactionType;
  amount: string | number;
  className?: string;
}) {
  const sign = TRANSACTION_FLOWS[type].sign;
  const d = toDecimal(amount);
  const text = sign === "out" ? `-${formatINR(d)}` : sign === "in" ? `+${formatINR(d)}` : formatINR(d);
  return (
    <span
      className={cn(
        "tabular font-semibold",
        sign === "out" && "text-expense",
        sign === "in" && "text-income",
        sign === "neutral" && "text-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
