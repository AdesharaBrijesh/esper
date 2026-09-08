import Link from "next/link";
import { TransactionAmount } from "@/components/shared/money";
import {
  OWNER_LABELS,
  PAYMENT_MODE_LABELS,
  TRANSACTION_TYPE_ICONS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/constants";
import { relativeDateLabel } from "@/lib/dates";
import type { TransactionDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Primary line for a transaction: category, person, or type label. */
export function transactionTitle(t: TransactionDTO): string {
  if (t.category) return t.category.name;
  if (t.loan) {
    const verb =
      t.type === "BORROW"
        ? "Borrowed from"
        : t.type === "LEND"
          ? "Lent to"
          : t.type === "LOAN_REPAYMENT"
            ? "Repaid to"
            : "Received from";
    return `${verb} ${t.loan.personName}`;
  }
  return TRANSACTION_TYPE_LABELS[t.type];
}

/** Secondary line: account movement (+ notes). */
export function transactionSubtitle(t: TransactionDTO): string {
  const from = t.fromAccount?.name;
  const to = t.toAccount?.name;
  let accounts = "";
  if (from && to) accounts = `${from} → ${to}`;
  else if (from) accounts = from;
  else if (to) accounts = to;
  const parts = [accounts, t.notes].filter(Boolean);
  return parts.join(" · ");
}

export function TransactionIcon({ t, className }: { t: TransactionDTO; className?: string }) {
  const icon = t.category?.icon || TRANSACTION_TYPE_ICONS[t.type];
  return (
    <div
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg", className)}
      style={t.category?.color ? { backgroundColor: `${t.category.color}22` } : undefined}
      aria-hidden
    >
      {icon}
    </div>
  );
}

/**
 * One transaction in a list. Links to the detail/edit page.
 */
export function TransactionRow({
  transaction: t,
  showDate = false,
  showOwner = true,
  href,
  className,
}: {
  transaction: TransactionDTO;
  showDate?: boolean;
  showOwner?: boolean;
  href?: string | null;
  className?: string;
}) {
  const content = (
    <>
      <TransactionIcon t={t} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{transactionTitle(t)}</p>
          {showOwner && t.owner === "BROTHER" ? (
            <span className="shrink-0 rounded-md bg-trading/15 px-1.5 py-0.5 text-[10px] font-semibold text-trading uppercase">
              {OWNER_LABELS[t.owner]}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[showDate ? relativeDateLabel(t.transactionDate) : null, transactionSubtitle(t) || PAYMENT_MODE_LABELS[t.paymentMode]]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <TransactionAmount type={t.type} amount={t.amount} className="text-sm" />
        {t.category ? null : (
          <span className="text-[10px] text-muted-foreground uppercase">{TRANSACTION_TYPE_LABELS[t.type]}</span>
        )}
      </div>
    </>
  );
  const classes = cn(
    "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted",
    className,
  );
  if (href === null) return <div className={classes}>{content}</div>;
  return (
    <Link href={href ?? `/transactions/${t.id}`} className={classes}>
      {content}
    </Link>
  );
}

/**
 * Transactions grouped by day with sticky-ish headers ("Today", "Yesterday", "Mon, 1 Sept").
 */
export function TransactionList({
  transactions,
  emptyMessage = "No transactions yet.",
  showOwner = true,
  className,
}: {
  transactions: TransactionDTO[];
  emptyMessage?: string;
  showOwner?: boolean;
  className?: string;
}) {
  if (transactions.length === 0) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const groups: { date: string; items: TransactionDTO[] }[] = [];
  for (const t of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.transactionDate) last.items.push(t);
    else groups.push({ date: t.transactionDate, items: [t] });
  }
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {groups.map((g) => (
        <section key={g.date}>
          <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {relativeDateLabel(g.date)}
          </h3>
          <div className="flex flex-col">
            {g.items.map((t) => (
              <TransactionRow key={t.id} transaction={t} showOwner={showOwner} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
