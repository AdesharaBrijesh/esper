"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteAccountAction, setAccountActiveAction } from "@/lib/actions/accounts";
import type { AccountDTO } from "@/lib/types";

/** Archive / restore / delete controls for an account. */
export function AccountActions({ account, transactionCount }: { account: AccountDTO; transactionCount: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const canDelete = transactionCount === 0;

  return (
    <div className="flex flex-wrap gap-2">
      {account.isActive ? (
        <Button variant="outline" size="lg" className="h-10 rounded-xl" onClick={() => setConfirm("archive")}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="h-10 rounded-xl"
          onClick={async () => {
            const res = await setAccountActiveAction(account.id, true);
            if (!res.ok) return toast.error(res.error);
            toast.success("Account restored");
            router.refresh();
          }}
        >
          <ArchiveRestore className="size-4" aria-hidden />
          Restore
        </Button>
      )}
      {canDelete ? (
        <Button variant="destructive" size="lg" className="h-10 rounded-xl" onClick={() => setConfirm("delete")}>
          <Trash2 className="size-4" aria-hidden />
          Delete
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${account.name}?`}
        description="Archived accounts keep their history and balance but are hidden from forms and totals. You can restore them any time."
        confirmLabel="Archive"
        onConfirm={async () => {
          const res = await setAccountActiveAction(account.id, false);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Account archived");
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${account.name}?`}
        description="This account has no transactions, so it can be removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deleteAccountAction(account.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Account deleted");
          router.push("/accounts");
          router.refresh();
        }}
      />
    </div>
  );
}

/** Small inline restore button used in the archived list. */
export function RestoreAccountButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 rounded-lg"
      onClick={async () => {
        const res = await setAccountActiveAction(id, true);
        if (!res.ok) return toast.error(res.error);
        toast.success("Account restored");
        router.refresh();
      }}
    >
      <ArchiveRestore className="size-4" aria-hidden />
      Restore
    </Button>
  );
}
