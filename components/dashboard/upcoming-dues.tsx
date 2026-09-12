import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Money } from "@/components/shared/money";
import { dueLabel } from "@/lib/calculations/plans";
import { todayDateOnly } from "@/lib/dates";
import { PLAN_KIND_ICONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UpcomingInstallment } from "@/lib/data/plans";

/**
 * What is due next, on the home screen.
 *
 * This is the payoff of the plans model: a fee deadline three months out is visible
 * without remembering it, and an overdue one is impossible to miss.
 */
export function UpcomingDues({ installments }: { installments: UpcomingInstallment[] }) {
  if (installments.length === 0) return null;
  const today = todayDateOnly();
  const overdue = installments.filter((i) => i.view === "OVERDUE").length;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Coming up
          {overdue > 0 ? <span className="ml-2 text-xs font-medium text-expense">{overdue} overdue</span> : null}
        </h2>
        <Link href="/plans" className="text-xs text-primary hover:underline">
          All plans
        </Link>
      </div>

      <ul className="-mx-1 flex flex-col">
        {installments.map((installment) => (
          <li key={installment.id}>
            <Link
              href={`/plans/${installment.planId}`}
              className="flex items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-muted/60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-base" aria-hidden>
                {installment.categoryIcon ?? PLAN_KIND_ICONS[installment.planKind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{installment.planName}</p>
                <p
                  className={cn(
                    "truncate text-xs",
                    installment.view === "OVERDUE" ? "font-medium text-expense" : "text-muted-foreground",
                  )}
                >
                  {installment.label ? `${installment.label} · ` : ""}
                  {dueLabel(installment.dueDate, today)}
                </p>
              </div>
              <Money value={installment.amount} className="shrink-0 text-sm font-semibold" />
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
