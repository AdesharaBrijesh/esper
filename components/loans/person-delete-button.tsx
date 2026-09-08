"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, useConfirm } from "@/components/shared/confirm-dialog";
import { deletePersonAction } from "@/lib/actions/people";

export function PersonDeleteButton({ id, name, iconOnly = false }: { id: string; name: string; iconOnly?: boolean }) {
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
        description="This person has no loan history and will be removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const res = await deletePersonAction(id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Person deleted");
          router.push("/loans");
          router.refresh();
        }}
      />
    </>
  );
}
