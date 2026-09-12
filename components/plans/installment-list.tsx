"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CheckCheck, Loader2, MinusCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { AmountInput } from "@/components/shared/amount-input";
import { DateInput } from "@/components/shared/date-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Money } from "@/components/shared/money";
import { bulkPayAction, payInstallmentAction, skipInstallmentAction, unpayInstallmentAction } from "@/lib/actions/plans";
import { dueLabel } from "@/lib/calculations/plans";
import { formatDateOnly, todayDateOnly } from "@/lib/dates";
import { INSTALLMENT_VIEW_LABELS, type InstallmentView } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AccountDTO, InstallmentDTO, PlanDTO } from "@/lib/types";

type Filter = "ALL" | "DUE" | "PAID";

const VIEW_STYLES: Record<InstallmentView, string> = {
  PAID: "bg-income/10 text-income",
  SKIPPED: "bg-muted text-muted-foreground",
  OVERDUE: "bg-expense/10 text-expense",
  DUE_SOON: "bg-loan/15 text-loan",
  UPCOMING: "bg-muted text-muted-foreground",
};

export function InstallmentList({
  plan,
  installments,
  accounts,
}: {
  plan: PlanDTO;
  installments: InstallmentDTO[];
  accounts: AccountDTO[];
}) {
  const router = useRouter();
  const today = todayDateOnly();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = useState<InstallmentDTO | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    if (filter === "DUE") return installments.filter((i) => i.status === "PENDING");
    if (filter === "PAID") return installments.filter((i) => i.status === "PAID");
    return installments;
  }, [installments, filter]);

  const selectable = visible.filter((i) => i.status === "PENDING");
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)));
  };

  /** Selecting every instalment already due is the common backfill gesture. */
  const selectOverdue = () => {
    setSelected(new Set(installments.filter((i) => i.view === "OVERDUE").map((i) => i.id)));
  };

  const overdueCount = installments.filter((i) => i.view === "OVERDUE").length;

  const runSkip = (installment: InstallmentDTO, skip: boolean) => {
    startTransition(async () => {
      const res = await skipInstallmentAction(installment.id, skip);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(skip ? "Instalment skipped" : "Instalment restored");
      router.refresh();
    });
  };

  const runUnpay = (installment: InstallmentDTO) => {
    startTransition(async () => {
      const res = await unpayInstallmentAction(installment.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment undone and the transaction removed");
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<Filter>
          aria-label="Filter instalments"
          size="sm"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setSelected(new Set());
          }}
          options={[
            { value: "ALL", label: `All ${installments.length}` },
            { value: "DUE", label: `Unpaid ${plan.progress.pending}` },
            { value: "PAID", label: `Paid ${plan.progress.paid}` },
          ]}
        />
        {overdueCount > 0 ? (
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={selectOverdue}>
            <CheckCheck className="size-3.5" aria-hidden />
            Select {overdueCount} overdue
          </Button>
        ) : null}
      </div>

      {selectable.length > 0 ? (
        <label className="flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-2 text-sm">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all unpaid" />
          <span className="text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Select instalments to mark paid together"}
          </span>
        </label>
      ) : null}

      <ul className="flex flex-col gap-2">
        {visible.map((installment) => {
          const isPending = installment.status === "PENDING";
          return (
            <li
              key={installment.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
                selected.has(installment.id) && "border-primary/50 bg-primary/5",
              )}
            >
              {isPending ? (
                <Checkbox
                  checked={selected.has(installment.id)}
                  onCheckedChange={() => toggle(installment.id)}
                  aria-label={`Select ${installment.label ?? installment.sequence}`}
                />
              ) : (
                <span className="flex size-4 items-center justify-center" aria-hidden>
                  {installment.status === "PAID" ? <Check className="size-4 text-income" /> : null}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{installment.label ?? `#${installment.sequence}`}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {installment.status === "PAID" && installment.paidDate
                    ? `Paid ${formatDateOnly(installment.paidDate, { withYear: true })}`
                    : `${formatDateOnly(installment.dueDate, { withYear: true })} · ${dueLabel(installment.dueDate, today)}`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Money value={installment.amount} className="text-sm font-semibold" />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                    VIEW_STYLES[installment.view],
                  )}
                >
                  {INSTALLMENT_VIEW_LABELS[installment.view]}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {isPending ? (
                  <>
                    <Button
                      size="sm"
                      className="h-8 rounded-lg px-2.5 text-xs"
                      onClick={() => setPayTarget(installment)}
                      disabled={pending}
                    >
                      Pay
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 rounded-lg"
                      title="Skip this instalment"
                      aria-label="Skip this instalment"
                      onClick={() => runSkip(installment, true)}
                      disabled={pending}
                    >
                      <MinusCircle className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : installment.status === "SKIPPED" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 rounded-lg px-2.5 text-xs"
                    onClick={() => runSkip(installment, false)}
                    disabled={pending}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 rounded-lg"
                    title="Undo this payment"
                    aria-label="Undo this payment"
                    onClick={() => runUnpay(installment)}
                    disabled={pending}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : null}

      {/* Sticky bulk bar: the whole point of selecting several at once. */}
      {selected.size > 0 ? (
        <div className="pb-safe sticky bottom-16 z-30 md:bottom-4">
          <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{selected.size} selected</p>
              <p className="truncate text-xs text-muted-foreground">
                <Money
                  value={installments
                    .filter((i) => selected.has(i.id))
                    .reduce((total, i) => total + Number(i.amount), 0)
                    .toFixed(2)}
                />{" "}
                total
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" className="h-9 rounded-xl" onClick={() => setBulkOpen(true)}>
              Mark paid
            </Button>
          </div>
        </div>
      ) : null}

      <PayDialog
        key={payTarget?.id ?? "none"}
        plan={plan}
        installment={payTarget}
        accounts={accounts}
        onClose={() => setPayTarget(null)}
        onDone={() => {
          setPayTarget(null);
          router.refresh();
        }}
      />

      <BulkPayDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        plan={plan}
        accounts={accounts}
        installmentIds={[...selected]}
        onDone={() => {
          setBulkOpen(false);
          setSelected(new Set());
          router.refresh();
        }}
      />
    </section>
  );
}

/** Single payment: amount and date can differ from the schedule, which is usually why you are here. */
function PayDialog({
  plan,
  installment,
  accounts,
  onClose,
  onDone,
}: {
  plan: PlanDTO;
  installment: InstallmentDTO | null;
  accounts: AccountDTO[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The caller remounts this component per instalment (via key), so seeding the fields
  // here is enough — no effect syncing props into state, and the inputs stay clearable.
  const [amount, setAmount] = useState(installment?.amount ?? "");
  const [paidDate, setPaidDate] = useState(todayDateOnly());
  const [fromAccountId, setFromAccountId] = useState(plan.fromAccountId ?? accounts[0]?.id ?? "");

  const open = installment !== null;

  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  const submit = () => {
    if (!installment) return;
    setError(null);
    startTransition(async () => {
      const res = await payInstallmentAction({
        installmentId: installment.id,
        amount,
        paidDate,
        fromAccountId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Marked paid and added to your activity");
      onDone();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl p-5 sm:max-w-md">
        <DialogHeader className="p-0">
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            {installment?.label ?? ""} · This adds a real transaction, so your balances update too.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-4">
          <FormError message={error} />
          <Field id="pay-amount" label="Amount paid">
            <AmountInput id="pay-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field id="pay-date" label="Date paid">
            <DateInput id="pay-date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </Field>
          <Field id="pay-account" label="Paid from">
            <NativeSelect
              id="pay-account"
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
        </div>
        <DialogFooter className="mt-4 flex-row gap-2 p-0">
          <Button variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bulk payment: the backfill path. Dating each instalment on its own due date is the
 * default, so past years land in the right months in reports instead of all on today.
 */
function BulkPayDialog({
  open,
  onOpenChange,
  plan,
  accounts,
  installmentIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDTO;
  accounts: AccountDTO[];
  installmentIds: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [useDueDate, setUseDueDate] = useState(true);
  const [paidDate, setPaidDate] = useState(todayDateOnly());
  const [fromAccountId, setFromAccountId] = useState(plan.fromAccountId ?? accounts[0]?.id ?? "");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await bulkPayAction({
        planId: plan.id,
        installmentIds,
        fromAccountId,
        useDueDate,
        paidDate: useDueDate ? null : paidDate,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`${res.data.paid} instalment${res.data.paid === 1 ? "" : "s"} marked paid`);
      onDone();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl p-5 sm:max-w-md">
        <DialogHeader className="p-0">
          <DialogTitle>Mark {installmentIds.length} as paid</DialogTitle>
          <DialogDescription>
            One transaction is created per instalment, so your history and balances stay correct.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col gap-4">
          <FormError message={error} />
          <Field id="bulk-account" label="Paid from">
            <NativeSelect
              id="bulk-account"
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field id="bulk-dating" label="Date each payment">
            <SegmentedControl<"due" | "same">
              aria-label="Date each payment"
              fullWidth
              value={useDueDate ? "due" : "same"}
              onChange={(v) => setUseDueDate(v === "due")}
              options={[
                { value: "due", label: "On its due date" },
                { value: "same", label: "All on one date" },
              ]}
            />
          </Field>
          {!useDueDate ? (
            <Field id="bulk-date" label="Date">
              <DateInput id="bulk-date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
          ) : null}
        </div>
        <DialogFooter className="mt-4 flex-row gap-2 p-0">
          <Button variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="lg" className="h-11 flex-1 rounded-xl" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Mark all paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
