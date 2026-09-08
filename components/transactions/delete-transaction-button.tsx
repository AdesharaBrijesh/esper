"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/shared/confirm-dialog";
import { deleteTransactionAction } from "@/lib/actions/transactions";

export function DeleteTransactionButton({ id, returnTo = "/transactions" }: { id: string; returnTo?: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <>
      <Button variant="destructive" size="lg" className="h-11 rounded-xl" onClick={confirm.show}>
        <Trash2 className="size-4" aria-hidden />
        Delete
      </Button>
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        title="Delete this transaction?"
        description="Account balances (and any linked loan) will be recalculated. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteTransactionAction(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Transaction deleted");
          router.push(returnTo);
          router.refresh();
        }}
      />
    </>
  );
}
