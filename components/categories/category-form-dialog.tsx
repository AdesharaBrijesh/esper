"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/shared/form-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { categorySchema, type CategoryData, type CategoryInput } from "@/lib/validations/category";
import { createCategoryAction, updateCategoryAction } from "@/lib/actions/categories";
import {
  CATEGORY_COLOR_CHOICES,
  CATEGORY_ICON_CHOICES,
  CATEGORY_TYPE_LABELS,
  CATEGORY_TYPES,
  type CategoryType,
} from "@/lib/constants";
import type { CategoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryFormDialog({
  category,
  defaultType = "EXPENSE",
  usageCount = 0,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
  iconOnly = false,
}: {
  category?: CategoryDTO;
  defaultType?: CategoryType;
  usageCount?: number;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!category;
  const typeLocked = isEdit && usageCount > 0;

  const initial = (): CategoryInput => ({
    name: category?.name ?? "",
    type: category?.type ?? defaultType,
    icon: category?.icon ?? CATEGORY_ICON_CHOICES[0],
    color: category?.color ?? CATEGORY_COLOR_CHOICES[0],
    isActive: category?.isActive ?? true,
  });

  const form = useForm<CategoryInput, unknown, CategoryData>({ resolver: zodResolver(categorySchema), defaultValues: initial() });
  const { register, handleSubmit, setValue, watch, setError, formState, reset } = form;
  const type = watch("type") as CategoryType;
  const icon = watch("icon") ?? "";
  const color = watch("color") ?? "";

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setFormError(null);
      reset(initial());
    }
  };

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const res = isEdit ? await updateCategoryAction(category.id, values) : await createCategoryAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof CategoryInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      toast.success(isEdit ? "Category updated" : "Category added");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button
        variant={triggerVariant}
        size={iconOnly ? "icon" : "lg"}
        className={triggerClassName ?? (iconOnly ? "size-9 rounded-lg" : "h-10 rounded-xl")}
        aria-label={iconOnly ? (isEdit ? "Edit category" : "Add category") : undefined}
        onClick={() => onOpenChange(true)}
      >
        {isEdit ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" strokeWidth={2.5} aria-hidden />}
        {iconOnly ? null : (triggerLabel ?? (isEdit ? "Edit" : "Add category"))}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto rounded-2xl p-5 sm:max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <DialogHeader className="p-0">
              <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
              <DialogDescription>Pick a name, an emoji and a colour.</DialogDescription>
            </DialogHeader>
            <FormError message={formError} />

            <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
              <span
                className="flex size-12 items-center justify-center rounded-xl text-2xl"
                style={{ backgroundColor: color ? `${color}33` : undefined }}
                aria-hidden
              >
                {icon || "•"}
              </span>
              <div className="min-w-0 flex-1">
                <Field id="cat-name" error={formState.errors.name?.message}>
                  <Input id="cat-name" placeholder="Category name" autoFocus className="h-11 rounded-xl bg-background" aria-label="Category name" {...register("name")} />
                </Field>
              </div>
            </div>

            <Field
              id="cat-type"
              label="Type"
              error={formState.errors.type?.message}
              hint={typeLocked ? `Locked: used by ${usageCount} transaction${usageCount === 1 ? "" : "s"}` : undefined}
            >
              <SegmentedControl<CategoryType>
                aria-label="Category type"
                fullWidth
                options={CATEGORY_TYPES.map((t) => ({ value: t, label: CATEGORY_TYPE_LABELS[t] }))}
                value={type}
                onChange={(v) => !typeLocked && setValue("type", v, { shouldValidate: true })}
                className={cn(typeLocked && "pointer-events-none opacity-60")}
              />
            </Field>

            <Field id="cat-icon" label="Icon" error={formState.errors.icon?.message}>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-8 gap-1" role="listbox" aria-label="Icon choices">
                  {CATEGORY_ICON_CHOICES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="option"
                      aria-selected={icon === e}
                      onClick={() => setValue("icon", e, { shouldValidate: true })}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-lg text-xl transition-colors hover:bg-muted",
                        icon === e && "bg-primary/15 ring-2 ring-primary",
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <Input id="cat-icon" placeholder="Or type any emoji" className="h-10 rounded-xl" maxLength={16} {...register("icon")} />
              </div>
            </Field>

            <Field id="cat-color" label="Colour" error={formState.errors.color?.message}>
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORY_COLOR_CHOICES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={color === c}
                    onClick={() => setValue("color", c, { shouldValidate: true })}
                    className={cn("size-8 rounded-full ring-offset-2 ring-offset-background transition-transform", color === c && "scale-110 ring-2 ring-foreground")}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-[10px] text-muted-foreground">
                  <input
                    id="cat-color"
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#64748b"}
                    onChange={(e) => setValue("color", e.target.value, { shouldValidate: true })}
                    className="size-10 cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Custom colour"
                  />
                </label>
              </div>
            </Field>

            <DialogFooter className="flex-row gap-2 p-0">
              <Button type="button" variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Save" : "Add category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
