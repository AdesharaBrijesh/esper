"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/shared/form-field";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/auth";
import { changePasswordAction } from "@/lib/actions/settings";

export function PasswordForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { register, handleSubmit, setError, formState, reset } = form;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const res = await changePasswordAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof ChangePasswordInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      toast.success("Password changed. Other devices were signed out.");
      reset();
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field id="pw-current" label="Current password" error={formState.errors.currentPassword?.message} required>
        <Input id="pw-current" type="password" autoComplete="current-password" className="h-11 rounded-xl" {...register("currentPassword")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pw-new" label="New password" error={formState.errors.newPassword?.message} required hint="At least 8 characters">
          <Input id="pw-new" type="password" autoComplete="new-password" className="h-11 rounded-xl" {...register("newPassword")} />
        </Field>
        <Field id="pw-confirm" label="Confirm new password" error={formState.errors.confirmPassword?.message} required>
          <Input id="pw-confirm" type="password" autoComplete="new-password" className="h-11 rounded-xl" {...register("confirmPassword")} />
        </Field>
      </div>
      <Button type="submit" size="lg" className="h-11 rounded-xl sm:self-start" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Change password
      </Button>
    </form>
  );
}
