"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2, Play, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cancelPlanAction, deletePlanAction, extendPlanAction, reactivatePlanAction } from "@/lib/actions/plans";
import type { PlanDTO } from "@/lib/types";

/** Cancel / reactivate / extend / delete for one plan. */
export function PlanActions({ plan }: { plan: PlanDTO }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);

  const isCancelled = plan.status === "CANCELLED";
  const canExtend = plan.frequency !== "ONE_TIME" && !isCancelled;

  const extend = () =>
    startTransition(async () => {
      const res = await extendPlanAction({ planId: plan.id, count: 12 });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added ${res.data.added} more instalments`);
      router.refresh();
    });

  const reactivate = () =>
    startTransition(async () => {
      const res = await reactivatePlanAction(plan.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Plan reactivated");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {canExtend ? (
        <Button variant="outline" size="lg" className="h-10 rounded-xl" onClick={extend} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarPlus className="size-4" aria-hidden />}
          Add 12 more
        </Button>
      ) : null}

      {isCancelled ? (
        <Button variant="outline" size="lg" className="h-10 rounded-xl" onClick={reactivate} disabled={pending}>
          <Play className="size-4" aria-hidden />
          Reactivate
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="h-10 rounded-xl" onClick={() => setConfirm("cancel")}>
          <XCircle className="size-4" aria-hidden />
          Cancel plan
        </Button>
      )}

      <Button variant="ghost" size="lg" className="h-10 rounded-xl text-destructive" onClick={() => setConfirm("delete")}>
        <Trash2 className="size-4" aria-hidden />
        Delete
      </Button>

      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Cancel ${plan.name}?`}
        description="Unpaid instalments are removed. Everything you have already paid stays in your history."
        confirmLabel="Cancel plan"
        onConfirm={async () => {
          const res = await cancelPlanAction(plan.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Plan cancelled");
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${plan.name}?`}
        description="This cannot be undone. A plan with paid instalments cannot be deleted — cancel it instead, so your history stays intact."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deletePlanAction(plan.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Plan deleted");
          router.push("/plans");
        }}
      />
    </div>
  );
}
