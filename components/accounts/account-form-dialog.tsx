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
import { NativeSelect } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { AmountInput } from "@/components/shared/amount-input";
import { accountSchema, type AccountData, type AccountInput } from "@/lib/validations/account";
import { createAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import {
  ACCOUNT_TYPE_ICONS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  OWNER_LABELS,
  OWNERS,
  type AccountType,
  type Owner,
} from "@/lib/constants";
import type { AccountDTO } from "@/lib/types";

/** Card and investment accounts carry extra fields; everything else keeps the short form. */
function institutionLabel(type: AccountType): string {
  if (type === "CARD") return "Issuer";
  if (type === "INVESTMENT") return "Fund house / platform";
  return "Bank or provider";
}

export function AccountFormDialog({
  account,
  defaultType,
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
}: {
  account?: AccountDTO;
  /** Pre-selects a type when opened from the Cards or Investments screen. */
  defaultType?: AccountType;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!account;

  const initial = (): AccountInput => ({
    name: account?.name ?? "",
    type: account?.type ?? defaultType ?? "CASH",
    owner: account?.owner ?? "SELF",
    openingBalance: account?.openingBalance ?? "",
    isActive: account?.isActive ?? true,
    institution: account?.institution ?? "",
    last4: account?.last4 ?? "",
    creditLimit: account?.creditLimit ?? "",
    statementDay: account?.statementDay ?? "",
    dueDay: account?.dueDay ?? "",
  });

  const form = useForm<AccountInput, unknown, AccountData>({
    resolver: zodResolver(accountSchema),
    defaultValues: initial(),
  });
  const { register, handleSubmit, setValue, watch, setError, formState, reset } = form;
  const owner = watch("owner") as Owner;
  const type = watch("type") as AccountType;
  const isCard = type === "CARD";
  const isInvestment = type === "INVESTMENT";

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
      const res = isEdit ? await updateAccountAction(account.id, values) : await createAccountAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof AccountInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      toast.success(isEdit ? "Account updated" : "Account added");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button variant={triggerVariant} size="lg" className={triggerClassName ?? "h-10 rounded-xl"} onClick={() => onOpenChange(true)}>
        {isEdit ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" strokeWidth={2.5} aria-hidden />}
        {triggerLabel ?? (isEdit ? "Edit" : "Add account")}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] overflow-y-auto rounded-2xl p-5 sm:max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <DialogHeader className="p-0">
              <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
              <DialogDescription>
                {isEdit ? "Changing the opening balance recalculates the current balance." : "Add a place where your money lives."}
              </DialogDescription>
            </DialogHeader>
            <FormError message={formError} />
            <Field id="acc-name" label="Name" error={formState.errors.name?.message} required>
              <Input id="acc-name" placeholder="e.g. Self Bank" autoFocus className="h-11 rounded-xl" {...register("name")} />
            </Field>
            <Field id="acc-type" label="Type" error={formState.errors.type?.message} required>
              <NativeSelect
                id="acc-type"
                options={ACCOUNT_TYPES.map((t) => ({ value: t, label: `${ACCOUNT_TYPE_ICONS[t]} ${ACCOUNT_TYPE_LABELS[t]}` }))}
                {...register("type")}
              />
            </Field>
            <Field id="acc-owner" label="Owner" error={formState.errors.owner?.message} hint="Whose money is in this account">
              <SegmentedControl<Owner>
                aria-label="Owner"
                fullWidth
                options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))}
                value={owner}
                onChange={(v) => setValue("owner", v, { shouldValidate: true })}
              />
            </Field>

            {isCard || isInvestment ? (
              <Field id="acc-institution" label={institutionLabel(type)} error={formState.errors.institution?.message}>
                <Input
                  id="acc-institution"
                  placeholder={isCard ? "e.g. HDFC Bank" : "e.g. Zerodha Coin"}
                  className="h-11 rounded-xl"
                  {...register("institution")}
                />
              </Field>
            ) : null}

            {isCard ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="acc-last4" label="Last 4 digits" error={formState.errors.last4?.message}>
                    <Input
                      id="acc-last4"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="1234"
                      className="h-11 rounded-xl"
                      {...register("last4")}
                    />
                  </Field>
                  <Field id="acc-limit" label="Credit limit" error={formState.errors.creditLimit?.message}>
                    <AmountInput id="acc-limit" size="default" placeholder="0" inputMode="decimal" {...register("creditLimit")} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id="acc-statement"
                    label="Statement day"
                    error={formState.errors.statementDay?.message}
                    hint="Day of month"
                  >
                    <Input
                      id="acc-statement"
                      inputMode="numeric"
                      placeholder="e.g. 18"
                      className="h-11 rounded-xl"
                      {...register("statementDay")}
                    />
                  </Field>
                  <Field id="acc-due" label="Bill due day" error={formState.errors.dueDay?.message} hint="Day of month">
                    <Input
                      id="acc-due"
                      inputMode="numeric"
                      placeholder="e.g. 5"
                      className="h-11 rounded-xl"
                      {...register("dueDay")}
                    />
                  </Field>
                </div>
              </>
            ) : null}

            <Field
              id="acc-opening"
              label="Opening balance"
              error={formState.errors.openingBalance?.message}
              hint={
                isCard
                  ? "What you already owed on this card, as a negative number (e.g. -12000). Leave 0 if starting fresh."
                  : isInvestment
                    ? "What you had already invested here before tracking started."
                    : "Balance before any transaction was recorded."
              }
            >
              <AmountInput id="acc-opening" size="default" placeholder="0" inputMode="text" {...register("openingBalance")} />
            </Field>
            <DialogFooter className="flex-row gap-2 p-0">
              <Button type="button" variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Save" : "Add account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
