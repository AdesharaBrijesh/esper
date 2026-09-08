"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Pencil, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormError } from "@/components/shared/form-field";
import { personSchema, type PersonData, type PersonInput } from "@/lib/validations/person";
import { createPersonAction, updatePersonAction } from "@/lib/actions/people";
import type { PersonDTO } from "@/lib/types";

export function PersonFormDialog({
  person,
  triggerLabel,
  triggerVariant = "outline",
  triggerClassName,
}: {
  person?: PersonDTO;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = !!person;
  const initial = (): PersonInput => ({ name: person?.name ?? "", phone: person?.phone ?? "", notes: person?.notes ?? "" });

  const form = useForm<PersonInput, unknown, PersonData>({ resolver: zodResolver(personSchema), defaultValues: initial() });
  const { register, handleSubmit, setError, formState, reset } = form;

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
      const res = isEdit ? await updatePersonAction(person.id, values) : await createPersonAction(values);
      if (!res.ok) {
        for (const [f, msgs] of Object.entries(res.fieldErrors ?? {})) setError(f as keyof PersonInput, { message: msgs[0] });
        setFormError(res.error);
        return;
      }
      toast.success(isEdit ? "Person updated" : "Person added");
      setOpen(false);
      router.refresh();
    });
  });

  return (
    <>
      <Button variant={triggerVariant} size="lg" className={triggerClassName ?? "h-10 rounded-xl"} onClick={() => onOpenChange(true)}>
        {isEdit ? <Pencil className="size-4" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
        {triggerLabel ?? (isEdit ? "Edit" : "Add person")}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-2xl p-5 sm:max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <DialogHeader className="p-0">
              <DialogTitle>{isEdit ? "Edit person" : "New person"}</DialogTitle>
              <DialogDescription>Someone you borrow from or lend to.</DialogDescription>
            </DialogHeader>
            <FormError message={formError} />
            <Field id="p-name" label="Name" error={formState.errors.name?.message} required>
              <Input id="p-name" autoFocus className="h-11 rounded-xl" placeholder="e.g. Rahul" {...register("name")} />
            </Field>
            <Field id="p-phone" label="Phone (optional)" error={formState.errors.phone?.message}>
              <Input id="p-phone" type="tel" inputMode="tel" className="h-11 rounded-xl" placeholder="+91 …" {...register("phone")} />
            </Field>
            <Field id="p-notes" label="Notes (optional)" error={formState.errors.notes?.message}>
              <Textarea id="p-notes" rows={2} className="rounded-xl" {...register("notes")} />
            </Field>
            <DialogFooter className="flex-row gap-2 p-0">
              <Button type="button" variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" className="h-11 flex-1 rounded-xl" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Save" : "Add person"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
