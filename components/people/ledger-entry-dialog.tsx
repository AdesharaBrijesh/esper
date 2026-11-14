"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { createTransactionAction } from "@/lib/actions/transactions";
import { ACCOUNT_TYPE_PAYMENT_MODE, isPortfolioAccount, OWNER_LABELS, OWNERS } from "@/lib/constants";
import { addDays, todayDateOnly } from "@/lib/dates";
import { formatINR, parseMoneyInput, toDecimal } from "@/lib/money";
import type { AccountDTO } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/shared/amount-input";
import { DateInput } from "@/components/shared/date-input";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect, type SelectOptionGroup } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { cn } from "@/lib/utils";

export type LedgerDirection = "GAVE" | "GOT";

const ACCOUNT_KEY = (d: LedgerDirection) => `esper:ledger-account:${d}`;
const NO_ACCOUNT = "";

function readAccount(d: LedgerDirection): string | null {
  try {
    return window.localStorage.getItem(ACCOUNT_KEY(d));
  } catch {
    return null;
  }
}
function writeAccount(d: LedgerDirection, id: string) {
  try {
    window.localStorage.setItem(ACCOUNT_KEY(d), id);
  } catch {
    /* ignore */
  }
}

function standingText(balance: number, name: string): string {
  if (balance > 0) return `${name} will owe you ${formatINR(balance)}`;
  if (balance < 0) return `You will owe ${name} ${formatINR(Math.abs(balance))}`;
  return `You and ${name} will be settled up`;
}

/**
 * The "You gave / You got" pair of buttons plus the one sheet both open.
 *
 * `balance` is the person's current balance (positive: they owe you) so the sheet can
 * show what the balance becomes, and so "Settle up" can prefill the exact amount.
 */
export function LedgerEntryButtons({
  person,
  balance,
  accounts,
  className,
}: {
  person: { id: string; name: string };
  balance: string;
  accounts: AccountDTO[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<LedgerDirection>("GAVE");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayDateOnly());
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amountRef = useRef<HTMLInputElement>(null);

  const firstName = person.name.trim().split(/\s+/)[0] ?? person.name;
  const current = Number(balance);
  const usable = useMemo(() => accounts.filter((a) => a.isActive && !isPortfolioAccount(a.type)), [accounts]);
  const groups = useMemo<SelectOptionGroup[]>(
    () =>
      OWNERS.map((o) => ({
        label: OWNER_LABELS[o],
        options: usable.filter((a) => a.owner === o).map((a) => ({ value: a.id, label: `${a.name} · ${formatINR(a.balance)}` })),
      })).filter((g) => g.options.length > 0),
    [usable],
  );

  const openWith = (d: LedgerDirection, prefillAmount = "") => {
    setDirection(d);
    setAmount(prefillAmount);
    setNotes(prefillAmount ? "Settled up" : "");
    setDate(todayDateOnly());
    setAccountId(rememberedAccount(d));
    setError(null);
    setOpen(true);
  };

  /** The sheet keeps one account choice per direction. */
  const rememberedAccount = (d: LedgerDirection) => {
    const remembered = readAccount(d);
    return remembered && usable.some((a) => a.id === remembered) ? remembered : NO_ACCOUNT;
  };
  const changeDirection = (d: LedgerDirection) => {
    setDirection(d);
    setAccountId(rememberedAccount(d));
  };

  const parsed = parseMoneyInput(amount);
  const after = parsed ? current + (direction === "GAVE" ? 1 : -1) * Number(parsed.toFixed(2)) : null;
  const account = usable.find((a) => a.id === accountId);

  const submit = () => {
    if (!parsed || !parsed.greaterThan(0)) {
      setError("Enter an amount greater than 0.");
      amountRef.current?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createTransactionAction({
        type: direction,
        amount: toDecimal(parsed).toFixed(2),
        transactionDate: date,
        owner: account?.owner ?? "SELF",
        paymentMode: account ? ACCOUNT_TYPE_PAYMENT_MODE[account.type] : "OTHER",
        notes,
        fromAccountId: direction === "GAVE" ? accountId : "",
        toAccountId: direction === "GOT" ? accountId : "",
        personId: person.id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      writeAccount(direction, accountId);
      toast.success(direction === "GAVE" ? `Gave ${firstName} ${formatINR(parsed)}` : `Got ${formatINR(parsed)} from ${firstName}`);
      setOpen(false);
      router.refresh();
    });
  };

  const gave = direction === "GAVE";

  return (
    <>
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            variant="secondary"
            className="press h-12 rounded-xl bg-expense/10 text-expense hover:bg-expense/15"
            onClick={() => openWith("GAVE")}
          >
            <ArrowUpRight className="size-4" aria-hidden />
            You gave
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="press h-12 rounded-xl bg-income/10 text-income hover:bg-income/15"
            onClick={() => openWith("GOT")}
          >
            <ArrowDownLeft className="size-4" aria-hidden />
            You got
          </Button>
        </div>
        {current !== 0 ? (
          <button
            type="button"
            onClick={() => openWith(current < 0 ? "GAVE" : "GOT", Math.abs(current).toFixed(2))}
            className="h-9 rounded-lg text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {current < 0 ? `Paid ${firstName} back? Settle ${formatINR(Math.abs(current))}` : `${firstName} paid you back? Settle ${formatINR(current)}`}
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-2xl p-5 sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <DialogHeader className="p-0">
              <DialogTitle>{gave ? `You gave ${firstName}` : `You got from ${firstName}`}</DialogTitle>
              <DialogDescription>
                {gave ? "Money that went from you to them." : "Money that came from them to you."}
              </DialogDescription>
            </DialogHeader>

            <SegmentedControl<LedgerDirection>
              aria-label="Direction"
              fullWidth
              value={direction}
              onChange={changeDirection}
              options={[
                { value: "GAVE", label: "You gave", icon: <ArrowUpRight className="size-3.5" aria-hidden /> },
                { value: "GOT", label: "You got", icon: <ArrowDownLeft className="size-3.5" aria-hidden /> },
              ]}
            />

            <FormError message={error} />

            <Field id="le-amount" label="Amount" required>
              <AmountInput
                ref={amountRef}
                id="le-amount"
                size="xl"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(gave ? "text-expense" : "text-income")}
              />
              <p className={cn("min-h-4 text-xs", after === null ? "text-transparent" : "text-muted-foreground")} aria-live="polite">
                {after === null ? "·" : standingText(after, firstName)}
              </p>
            </Field>

            <Field id="le-notes" label="What for? (optional)">
              <Input
                id="le-notes"
                className="h-11 rounded-xl"
                placeholder={gave ? "e.g. Movie tickets" : "e.g. Lunch he paid for"}
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="le-date" label="Date">
                <DateInput id="le-date" value={date} onChange={(e) => setDate(e.target.value)} />
                <div className="mt-1.5 flex gap-1.5">
                  {[
                    { label: "Today", value: todayDateOnly() },
                    { label: "Yesterday", value: addDays(todayDateOnly(), -1) },
                  ].map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setDate(c.value)}
                      className={cn(
                        "h-7 rounded-md border px-2.5 text-[11px] font-medium transition-colors",
                        date === c.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                id="le-account"
                label={gave ? "Paid from" : "Received in"}
                hint={account ? undefined : "Only a record. No account balance changes."}
              >
                <NativeSelect
                  id="le-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={[{ value: NO_ACCOUNT, label: "Not through an account" }]}
                  groups={groups}
                />
              </Field>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className={cn("h-12 rounded-xl text-base", gave ? "bg-expense text-white hover:bg-expense/90" : "bg-income text-white hover:bg-income/90")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {gave ? "Save: you gave" : "Save: you got"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
