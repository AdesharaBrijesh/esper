import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Money } from "@/components/shared/money";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/dates";
import { dueLabel } from "@/lib/calculations/plans";
import { todayDateOnly } from "@/lib/dates";
import { OWNER_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CardDTO } from "@/lib/types";

const LEVEL_BAR: Record<CardDTO["level"], string> = {
  none: "[&>div]:bg-primary",
  healthy: "[&>div]:bg-income",
  warn: "[&>div]:bg-loan",
  danger: "[&>div]:bg-expense",
};

const LEVEL_TEXT: Record<CardDTO["level"], string> = {
  none: "text-muted-foreground",
  healthy: "text-income",
  warn: "text-loan",
  danger: "text-expense",
};

/**
 * One credit card. The headline is what is owed, because that is the number that
 * decides whether you can spend — not the account balance, which reads negative.
 */
export function CardTile({ card }: { card: CardDTO }) {
  const today = todayDateOnly();

  return (
    <article className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", !card.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{card.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[card.institution, card.last4 ? `•••• ${card.last4}` : null, OWNER_LABELS[card.owner]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Money value={card.outstanding} className="text-lg font-semibold" tone={card.outstanding === "0.00" ? "muted" : "auto"} />
          <p className="text-[11px] text-muted-foreground">outstanding</p>
        </div>
      </div>

      {card.creditLimit ? (
        <div className="flex flex-col gap-1.5">
          <Progress value={card.utilisation ?? 0} className={cn("h-1.5", LEVEL_BAR[card.level])} />
          <div className="flex items-center justify-between text-[11px]">
            <span className={LEVEL_TEXT[card.level]}>{card.utilisation}% of limit used</span>
            <span className="text-muted-foreground">
              <Money value={card.available ?? "0"} compact className="font-medium text-foreground" /> available
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Set a credit limit to track utilisation.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          This month <Money value={card.spentThisMonth} className="font-medium text-foreground" />
        </span>
        {card.nextDueDate ? (
          <span>
            Bill due {formatDateOnly(card.nextDueDate)} · {dueLabel(card.nextDueDate, today).toLowerCase()}
          </span>
        ) : null}
      </div>

      {Number(card.outstanding) > 0 ? (
        <Button
          variant="outline"
          size="lg"
          className="h-10 w-full rounded-xl"
          render={
            // Paying the bill is a transfer into the card, which is exactly what the
            // ledger already models — no special "bill payment" type needed.
            <Link
              href={`/transactions/new?type=TRANSFER&toAccountId=${card.id}&amount=${card.outstanding}&returnTo=/cards`}
            />
          }
        >
          Pay bill
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : null}
    </article>
  );
}
