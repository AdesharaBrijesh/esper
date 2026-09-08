"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/shared/form-field";
import { profileSchema, type ProfileInput } from "@/lib/validations/auth";
import { updateProfileAction } from "@/lib/actions/settings";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { name, email } });
  const { register, handleSubmit, setError, formState } = form;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const res = await updateProfileAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof ProfileInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormError message={formError} />
      <Field id="pf-name" label="Name" error={formState.errors.name?.message} required>
        <Input id="pf-name" autoComplete="name" className="h-11 rounded-xl" {...register("name")} />
      </Field>
      <Field id="pf-email" label="Email" error={formState.errors.email?.message} required hint="Used to sign in">
        <Input id="pf-email" type="email" autoComplete="email" inputMode="email" className="h-11 rounded-xl" {...register("email")} />
      </Field>
      <Button type="submit" size="lg" className="h-11 rounded-xl sm:self-start" disabled={pending || !formState.isDirty}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Save profile
      </Button>
    </form>
  );
}
