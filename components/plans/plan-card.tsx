import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Money } from "@/components/shared/money";
import { Progress } from "@/components/ui/progress";
import { dueLabel } from "@/lib/calculations/plans";
import { todayDateOnly } from "@/lib/dates";
import { PLAN_FREQUENCY_LABELS, PLAN_KIND_ICONS, PLAN_KIND_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { PlanDTO } from "@/lib/types";

/**
 * One plan in the list. The line that matters most is what is owed next, so it is the
 * only thing rendered in colour.
 */
export function PlanCard({ plan }: { plan: PlanDTO }) {
  const today = todayDateOnly();
  const { progress } = plan;
  const isCancelled = plan.status === "CANCELLED";
  const isCompleted = plan.status === "COMPLETED";
  const hasSchedule = progress.total > 0;

  return (
    <Link
      href={`/plans/${plan.id}`}
      className={cn(
        "surface-interactive group flex flex-col gap-3 rounded-2xl border bg-card p-4",
        isCancelled && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg"
          aria-hidden
        >
          {plan.category?.icon ?? PLAN_KIND_ICONS[plan.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{plan.name}</p>
            {isCompleted ? (
              <span className="shrink-0 rounded-full bg-income/10 px-2 py-0.5 text-[10px] font-semibold text-income">
                Done
              </span>
            ) : null}
            {isCancelled ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Cancelled
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {PLAN_KIND_LABELS[plan.kind]} · {PLAN_FREQUENCY_LABELS[plan.frequency]}
            {plan.provider ? ` · ${plan.provider}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Money value={plan.amount} className="font-semibold" />
          <p className="text-[11px] text-muted-foreground">per instalment</p>
        </div>
        <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>

      {hasSchedule ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Progress
              value={progress.percentPaid}
              className={cn("h-1.5", progress.overdue > 0 && "[&>div]:bg-expense")}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {progress.paid} of {progress.paid + progress.pending} paid
              </span>
              <span>
                <Money value={progress.remainingAmount} compact className="font-medium" /> left
              </span>
            </div>
          </div>

          {progress.overdue > 0 ? (
            <p className="text-xs font-medium text-expense">
              {progress.overdue} overdue · <Money value={progress.overdueAmount} tone="expense" />
            </p>
          ) : progress.nextDue ? (
            <p className="text-xs text-muted-foreground">
              Next <Money value={progress.nextDue.amount} className="font-medium text-foreground" /> ·{" "}
              {dueLabel(progress.nextDue.dueDate, today).toLowerCase()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Nothing outstanding</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No instalments scheduled yet</p>
      )}
    </Link>
  );
}
