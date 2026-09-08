"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/actions/auth";
import { Field, FormError } from "@/components/shared/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(loginAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <input type="hidden" name="next" value={next} />
      <FormError message={state?.error} />
      <Field id="email" label="Email" error={state?.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          className="h-11 rounded-xl"
          aria-invalid={state?.fieldErrors?.email ? true : undefined}
        />
      </Field>
      <Field id="password" label="Password" error={state?.fieldErrors?.password}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-xl"
          aria-invalid={state?.fieldErrors?.password ? true : undefined}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="mt-1 h-11 rounded-xl text-base">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Sign in
      </Button>
    </form>
  );
}
