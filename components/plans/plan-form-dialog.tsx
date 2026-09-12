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
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { AmountInput } from "@/components/shared/amount-input";
import { DateInput } from "@/components/shared/date-input";
import { planSchema, type PlanData, type PlanInput } from "@/lib/validations/plan";
import { createPlanAction, updatePlanAction } from "@/lib/actions/plans";
import {
  OWNER_LABELS,
  OWNERS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  PLAN_FREQUENCIES,
  PLAN_FREQUENCY_LABELS,
  PLAN_KIND_HINTS,
  PLAN_KIND_ICONS,
  PLAN_KIND_LABELS,
  PLAN_KINDS,
  type Owner,
  type PlanKind,
} from "@/lib/constants";
import { todayDateOnly } from "@/lib/dates";
import type { AccountDTO, CategoryDTO, PlanDTO } from "@/lib/types";

/**
 * One form for every kind of recurring commitment. The fields that change are the ones
 * that genuinely differ: a SIP needs a destination, everything else needs a category.
 */
export function PlanFormDialog({
  plan,
  accounts,
  investmentAccounts,
  categories,
  defaultKind,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
  triggerIcon = "plus",
}: {
  plan?: PlanDTO;
  /** Liquid accounts a plan can be paid from. */
  accounts: AccountDTO[];
  investmentAccounts: AccountDTO[];
  categories: CategoryDTO[];
  defaultKind?: PlanKind;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
  triggerIcon?: "plus" | "pencil";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!plan;

  const initial = (): PlanInput => ({
    kind: plan?.kind ?? defaultKind ?? "FEE",
    name: plan?.name ?? "",
    provider: plan?.provider ?? "",
    amount: plan?.amount ?? "",
    frequency: plan?.frequency ?? "MONTHLY",
    startDate: plan?.startDate ?? todayDateOnly(),
    endDate: plan?.endDate ?? "",
    totalCount: plan?.totalCount ?? "",
    owner: plan?.owner ?? "SELF",
    paymentMode: plan?.paymentMode ?? "BANK",
    categoryId: plan?.categoryId ?? "",
    fromAccountId: plan?.fromAccountId ?? "",
    toAccountId: plan?.toAccountId ?? "",
    remindDays: plan?.remindDays ?? 3,
    status: plan?.status ?? "ACTIVE",
    notes: plan?.notes ?? "",
  });

  const form = useForm<PlanInput, unknown, PlanData>({
    resolver: zodResolver(planSchema),
    defaultValues: initial(),
  });
  const { register, handleSubmit, setValue, watch, setError, formState, reset } = form;
  const kind = watch("kind") as PlanKind;
  const owner = watch("owner") as Owner;
  const isSip = kind === "SIP";

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
      const res = isEdit ? await updatePlanAction(plan.id, values) : await createPlanAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof PlanInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      if (isEdit) {
        toast.success("Plan updated");
      } else {
        const count = "installments" in res.data ? res.data.installments : 0;
        toast.success(`Plan created with ${count} instalment${count === 1 ? "" : "s"}`);
      }
      setOpen(false);
      router.refresh();
    });
  });

  const expenseCategories = categories.filter((c) => c.type === "EXPENSE" && c.isActive);

  return (
    <>
      <Button variant={triggerVariant} size="lg" className={triggerClassName ?? "h-10 rounded-xl"} onClick={() => onOpenChange(true)}>
        {triggerIcon === "pencil" ? (
          <Pencil className="size-4" aria-hidden />
        ) : (
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
        )}
        {triggerLabel ?? (isEdit ? "Edit" : "New plan")}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <DialogHeader className="p-0">
              <DialogTitle>{isEdit ? "Edit plan" : "New plan"}</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Unpaid instalments are re-priced. Anything already paid stays exactly as it was."
                  : "Set it up once and the whole schedule is generated, past terms included."}
              </DialogDescription>
            </DialogHeader>
            <FormError message={formError} />

            <Field id="plan-kind" label="What is this?" error={formState.errors.kind?.message} hint={PLAN_KIND_HINTS[kind]} required>
              <NativeSelect
                id="plan-kind"
                options={PLAN_KINDS.map((k) => ({ value: k, label: `${PLAN_KIND_ICONS[k]} ${PLAN_KIND_LABELS[k]}` }))}
                {...register("kind")}
              />
            </Field>

            <Field id="plan-name" label="Name" error={formState.errors.name?.message} required>
              <Input
                id="plan-name"
                placeholder={isSip ? "e.g. Index fund SIP" : "e.g. B.Tech semester fees"}
                className="h-11 rounded-xl"
                {...register("name")}
              />
            </Field>

            <Field id="plan-provider" label="Provider" error={formState.errors.provider?.message}>
              <Input
                id="plan-provider"
                placeholder={isSip ? "e.g. Zerodha Coin" : "e.g. Anna University"}
                className="h-11 rounded-xl"
                {...register("provider")}
              />
            </Field>

            <Field id="plan-amount" label="Amount per instalment" error={formState.errors.amount?.message} required>
              <AmountInput id="plan-amount" {...register("amount")} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field id="plan-frequency" label="Repeats" error={formState.errors.frequency?.message} required>
                <NativeSelect
                  id="plan-frequency"
                  options={PLAN_FREQUENCIES.map((f) => ({ value: f, label: PLAN_FREQUENCY_LABELS[f] }))}
                  {...register("frequency")}
                />
              </Field>
              <Field
                id="plan-count"
                label="How many"
                error={formState.errors.totalCount?.message}
                hint="Blank = until cancelled"
              >
                <Input
                  id="plan-count"
                  inputMode="numeric"
                  placeholder="e.g. 8"
                  className="h-11 rounded-xl"
                  {...register("totalCount")}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="plan-start"
                label="First due date"
                error={formState.errors.startDate?.message}
                hint="Backdate to add past terms"
                required
              >
                <DateInput id="plan-start" {...register("startDate")} />
              </Field>
              <Field id="plan-end" label="Ends on" error={formState.errors.endDate?.message} hint="Optional">
                <DateInput id="plan-end" {...register("endDate")} />
              </Field>
            </div>

            <Field id="plan-owner" label="Owner" error={formState.errors.owner?.message}>
              <SegmentedControl<Owner>
                aria-label="Owner"
                fullWidth
                options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))}
                value={owner}
                onChange={(v) => setValue("owner", v, { shouldValidate: true })}
              />
            </Field>

            <Field id="plan-from" label="Paid from" error={formState.errors.fromAccountId?.message} required>
              <NativeSelect
                id="plan-from"
                placeholder="Choose an account"
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                {...register("fromAccountId")}
              />
            </Field>

            {isSip ? (
              <Field
                id="plan-to"
                label="Invests into"
                error={formState.errors.toAccountId?.message}
                hint={investmentAccounts.length === 0 ? "Add an investment account first." : undefined}
                required
              >
                <NativeSelect
                  id="plan-to"
                  placeholder="Choose an investment account"
                  options={investmentAccounts.map((a) => ({ value: a.id, label: a.name }))}
                  {...register("toAccountId")}
                />
              </Field>
            ) : (
              <Field id="plan-category" label="Category" error={formState.errors.categoryId?.message} required>
                <NativeSelect
                  id="plan-category"
                  placeholder="Choose a category"
                  options={expenseCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ""} ${c.name}`.trim() }))}
                  {...register("categoryId")}
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field id="plan-mode" label="Payment mode" error={formState.errors.paymentMode?.message}>
                <NativeSelect
                  id="plan-mode"
                  options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
                  {...register("paymentMode")}
                />
              </Field>
              <Field id="plan-remind" label="Remind me" error={formState.errors.remindDays?.message} hint="Days ahead">
                <Input id="plan-remind" inputMode="numeric" className="h-11 rounded-xl" {...register("remindDays")} />
              </Field>
            </div>

            <Field id="plan-notes" label="Notes" error={formState.errors.notes?.message}>
              <Textarea id="plan-notes" rows={2} className="rounded-xl" placeholder="Anything worth remembering" {...register("notes")} />
            </Field>

            <DialogFooter className="flex-row gap-2 p-0">
              <Button type="button" variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Save" : "Create plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
