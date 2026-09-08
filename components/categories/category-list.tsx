"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { deleteCategoryAction, setCategoryActiveAction } from "@/lib/actions/categories";
import { CATEGORY_TYPE_LABELS, CATEGORY_TYPES, type CategoryType } from "@/lib/constants";
import type { CategoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryList({ categories, usage }: { categories: CategoryDTO[]; usage: Record<string, number> }) {
  const router = useRouter();
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [toDelete, setToDelete] = useState<CategoryDTO | null>(null);

  const list = categories.filter((c) => c.type === type);
  const active = list.filter((c) => c.isActive);
  const disabled = list.filter((c) => !c.isActive);

  const toggle = async (c: CategoryDTO, next: boolean) => {
    const res = await setCategoryActiveAction(c.id, next);
    if (!res.ok) return toast.error(res.error);
    toast.success(next ? `${c.name} enabled` : `${c.name} disabled`);
    router.refresh();
  };

  const Row = ({ c }: { c: CategoryDTO }) => {
    const count = usage[c.id] ?? 0;
    return (
      <li className={cn("flex items-center gap-3 rounded-xl px-2 py-2", !c.isActive && "opacity-60")}>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl"
          style={c.color ? { backgroundColor: `${c.color}33` } : undefined}
          aria-hidden
        >
          {c.icon ?? "•"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{c.name}</span>
          <span className="block text-xs text-muted-foreground">
            {count === 0 ? "Unused" : `${count} transaction${count === 1 ? "" : "s"}`}
          </span>
        </span>
        <Switch checked={c.isActive} onCheckedChange={(v) => toggle(c, v)} aria-label={`${c.name} enabled`} />
        <CategoryFormDialog category={c} usageCount={count} triggerVariant="ghost" iconOnly />
        {count === 0 ? (
          <Button variant="ghost" size="icon" className="size-9 rounded-lg text-destructive" aria-label={`Delete ${c.name}`} onClick={() => setToDelete(c)}>
            <Trash2 className="size-4" aria-hidden />
          </Button>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl<CategoryType>
          aria-label="Category type"
          options={CATEGORY_TYPES.map((t) => ({ value: t, label: `${CATEGORY_TYPE_LABELS[t]} (${categories.filter((c) => c.type === t).length})` }))}
          value={type}
          onChange={setType}
        />
        <CategoryFormDialog defaultType={type} />
      </div>

      {list.length === 0 ? (
        <EmptyState title={`No ${CATEGORY_TYPE_LABELS[type].toLowerCase()} categories`} action={<CategoryFormDialog defaultType={type} />} />
      ) : (
        <section className="rounded-2xl border bg-card p-2">
          <ul className="flex flex-col">
            {active.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
          {disabled.length > 0 ? (
            <>
              <p className="mt-2 px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Disabled</p>
              <ul className="flex flex-col">
                {disabled.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </ul>
            </>
          ) : null}
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        Categories used by transactions cannot be deleted; disable them to hide them from forms instead.
      </p>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Delete ${toDelete?.name}?`}
        description="This category is unused, so it can be removed permanently."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteCategoryAction(toDelete.id);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Category deleted");
          router.refresh();
        }}
      />
    </div>
  );
}
