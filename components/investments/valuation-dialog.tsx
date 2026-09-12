"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { AmountInput } from "@/components/shared/amount-input";
import { DateInput } from "@/components/shared/date-input";
import { recordValuationAction } from "@/lib/actions/valuations";
import { todayDateOnly } from "@/lib/dates";
import type { InvestmentDTO } from "@/lib/types";

/**
 * Records what a holding is worth today.
 *
 * This is the whole "how are my investments doing" mechanism: no price feed, no API
 * key, no background job that can quietly break. You read the number off your broker's
 * app when you happen to look, and the gain follows from it.
 */
export function ValuationDialog({
  investments,
  presetAccountId,
  triggerLabel = "Update value",
  triggerVariant = "default",
  triggerClassName,
}: {
  investments: InvestmentDTO[];
  presetAccountId?: string;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(presetAccountId ?? investments[0]?.id ?? "");
  const [asOf, setAsOf] = useState(todayDateOnly());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setError(null);
      setAccountId(presetAccountId ?? investments[0]?.id ?? "");
      setAsOf(todayDateOnly());
      // Seed with the last known value so a small change is a small edit.
      const current = investments.find((i) => i.id === (presetAccountId ?? investments[0]?.id));
      setValue(current?.currentValue ?? "");
      setNotes("");
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await recordValuationAction({ accountId, asOf, value, notes });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Value recorded");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant={triggerVariant}
        size="lg"
        className={triggerClassName ?? "h-10 rounded-xl"}
        onClick={() => onOpenChange(true)}
        disabled={investments.length === 0}
      >
        <TrendingUp className="size-4" aria-hidden />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-2xl p-5 sm:max-w-md">
          <DialogHeader className="p-0">
            <DialogTitle>What is it worth?</DialogTitle>
            <DialogDescription>
              Type the current value from your broker or fund app. Your gain is this minus what you put in.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-col gap-4">
            <FormError message={error} />
            <Field id="val-account" label="Holding">
              <NativeSelect
                id="val-account"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  const next = investments.find((i) => i.id === e.target.value);
                  setValue(next?.currentValue ?? "");
                }}
                options={investments.map((i) => ({ value: i.id, label: i.name }))}
              />
            </Field>
            <Field id="val-value" label="Current value">
              <AmountInput id="val-value" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <Field id="val-date" label="As of" hint="Recording twice on one day replaces the earlier figure.">
              <DateInput id="val-date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
            <Field id="val-notes" label="Notes">
              <Input
                id="val-notes"
                placeholder="Optional"
                className="h-11 rounded-xl"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter className="mt-4 flex-row gap-2 p-0">
            <Button variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="lg" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save value
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
