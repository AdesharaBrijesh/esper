"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/shared/confirm-dialog";
import { deletePersonAction } from "@/lib/actions/people";

export function PersonDeleteButton({
  id,
  name,
  entryCount = 0,
  iconOnly = false,
}: {
  id: string;
  name: string;
  entryCount?: number;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <>
      <Button
        variant={iconOnly ? "ghost" : "destructive"}
        size={iconOnly ? "icon" : "lg"}
        className={iconOnly ? "size-9 rounded-lg text-destructive" : "h-10 rounded-xl"}
        aria-label={iconOnly ? `Delete ${name}` : undefined}
        onClick={confirm.show}
      >
        <Trash2 className="size-4" aria-hidden />
        {iconOnly ? null : "Delete"}
      </Button>
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        title={`Delete ${name}?`}
        description={
          entryCount > 0
            ? `This also deletes their ${entryCount} entr${entryCount === 1 ? "y" : "ies"}. Any account balance those entries changed goes back to what it was. This can't be undone.`
            : "They have no entries and will be removed permanently."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deletePersonAction(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Person deleted");
          router.push("/people");
          router.refresh();
        }}
      />
    </>
  );
}
