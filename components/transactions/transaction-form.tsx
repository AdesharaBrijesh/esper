"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { transactionSchema, type TransactionData, type TransactionInput } from "@/lib/validations/transaction";
import { createTransactionAction, updateTransactionAction } from "@/lib/actions/transactions";
import {
  ACCOUNT_TYPE_PAYMENT_MODE,
  OWNER_LABELS,
  OWNERS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  REPAYMENT_TYPE_FOR_DIRECTION,
  TRADING_PROFIT_CATEGORY_NAME,
  TRANSACTION_FLOWS,
  TRANSACTION_GROUPS,
  TRANSACTION_TYPE_GROUP,
  TRANSACTION_TYPE_LABELS,
  type AccountKind,
  type Owner,
  type PaymentMode,
  type TransactionGroup,
  type TransactionType,
} from "@/lib/constants";
import { addDays, todayDateOnly } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { safePath } from "@/lib/safe-path";
import type { AccountDTO, CategoryDTO, LoanDTO, PersonDTO, TransactionDTO } from "@/lib/types";
import { AmountInput } from "@/components/shared/amount-input";
import { DateInput } from "@/components/shared/date-input";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect, type SelectOptionGroup } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface TransactionFormPrefill {
  type?: string;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
  owner?: string;
  loanId?: string;
  personId?: string;
  amount?: string;
  notes?: string;
  returnTo?: string;
}

interface Props {
  mode: "create" | "edit";
  transaction?: TransactionDTO;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  people: PersonDTO[];
  loans: LoanDTO[];
  prefill?: TransactionFormPrefill;
}

const NEW_PERSON = "__new__";
const REMEMBER_KEY = (type: string) => `leno:last:${type}`;

interface Remembered {
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
}

function isType(v: unknown): v is TransactionType {
  return typeof v === "string" && v in TRANSACTION_FLOWS;
}

function readRemembered(type: TransactionType): Remembered {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY(type));
    return raw ? (JSON.parse(raw) as Remembered) : {};
  } catch {
    return {};
  }
}

function remember(type: TransactionType, values: Partial<TransactionInput>) {
  try {
    window.localStorage.setItem(
      REMEMBER_KEY(type),
      JSON.stringify({
        fromAccountId: values.fromAccountId ?? null,
        toAccountId: values.toAccountId ?? null,
        categoryId: values.categoryId ?? null,
      } satisfies Remembered),
    );
  } catch {
    /* ignore */
  }
}

function accountMatchesKind(a: AccountDTO, kind: AccountKind): boolean {
  if (kind === "TRADING") return a.type === "TRADING";
  if (kind === "NON_TRADING") return a.type !== "TRADING";
  return true;
}

/** Active accounts of the right kind, plus `keepId` (an archived account already on the transaction). */
function accountGroups(accounts: AccountDTO[], kind: AccountKind, keepId?: string | null): SelectOptionGroup[] {
  const filtered = accounts.filter((a) => (a.isActive || a.id === keepId) && accountMatchesKind(a, kind));
  return OWNERS.map((owner) => ({
    label: OWNER_LABELS[owner],
    options: filtered
      .filter((a) => a.owner === owner)
      .map((a) => ({ value: a.id, label: `${a.name}${a.isActive ? "" : " (archived)"} · ${formatINR(a.balance)}` })),
  })).filter((g) => g.options.length > 0);
}

function submitLabel(type: TransactionType, mode: "create" | "edit"): string {
  if (mode === "edit") return "Save changes";
  switch (type) {
    case "EXPENSE":
      return "Add expense";
    case "INCOME":
      return "Add income";
    case "TRANSFER":
      return "Transfer money";
    case "TRADING_DEPOSIT":
      return "Deposit to trading";
    case "TRADING_WITHDRAWAL":
      return "Withdraw from trading";
    case "TRADING_PROFIT":
      return "Add profit";
    case "TRADING_LOSS":
      return "Add loss";
    case "BORROW":
      return "Record borrowing";
    case "LEND":
      return "Record lending";
    default:
      return "Record repayment";
  }
}

const ACCOUNT_LABELS: Partial<Record<TransactionType, { from?: string; to?: string }>> = {
  EXPENSE: { from: "Paid from" },
  INCOME: { to: "Received in" },
  TRANSFER: { from: "From", to: "To" },
  TRADING_DEPOSIT: { from: "From", to: "To trading account" },
  TRADING_WITHDRAWAL: { from: "From trading account", to: "To" },
  TRADING_PROFIT: { to: "Trading account" },
  TRADING_LOSS: { from: "Trading account" },
  BORROW: { to: "Received in" },
  LEND: { from: "Given from" },
  LOAN_REPAYMENT: { from: "Paid from" },
  LENT_REPAYMENT: { to: "Received in" },
};

export function TransactionForm({ mode, transaction, accounts, categories, people, loans, prefill }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [newPerson, setNewPerson] = useState(false);
  const ownerTouched = useRef(false);
  const modeTouched = useRef(false);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const addAnother = useRef(false);

  const returnTo = safePath(prefill?.returnTo, "/transactions");
  const loanLocked = mode === "edit" && !!transaction?.loanId;
  const hasPrefillIds = !!(prefill?.fromAccountId || prefill?.toAccountId || prefill?.categoryId);

  const validAccount = (id: string | null | undefined, kind: AccountKind): string =>
    id && accounts.some((a) => a.id === id && a.isActive && accountMatchesKind(a, kind)) ? id : "";
  const validCategory = (id: string | null | undefined, type: TransactionType): string => {
    const ct = TRANSACTION_FLOWS[type].categoryType;
    return id && categories.some((c) => c.id === id && c.isActive && (!ct || c.type === ct)) ? id : "";
  };
  const tradingProfitCategory = (type: TransactionType) =>
    type === "TRADING_PROFIT" ? categories.find((c) => c.type === "INCOME" && c.isActive && c.name === TRADING_PROFIT_CATEGORY_NAME)?.id : undefined;

  const defaults = useMemo<TransactionInput>(() => {
    if (mode === "edit" && transaction) {
      return {
        type: transaction.type,
        amount: transaction.amount,
        transactionDate: transaction.transactionDate,
        owner: transaction.owner,
        paymentMode: transaction.paymentMode,
        notes: transaction.notes ?? "",
        fromAccountId: transaction.fromAccountId ?? "",
        toAccountId: transaction.toAccountId ?? "",
        categoryId: transaction.categoryId ?? "",
        personId: transaction.loan?.personId ?? "",
        personName: "",
        loanId: transaction.loanId ?? "",
      };
    }
    const type: TransactionType = isType(prefill?.type) ? prefill.type : "EXPENSE";
    const flow = TRANSACTION_FLOWS[type];
    const prefillLoan = prefill?.loanId ? loans.find((l) => l.id === prefill.loanId) : undefined;
    const personLoan =
      !prefillLoan && prefill?.personId && flow.loan === "repays"
        ? loans.find((l) => l.personId === prefill.personId && REPAYMENT_TYPE_FOR_DIRECTION[l.direction] === type)
        : undefined;
    const loan = prefillLoan ?? personLoan;
    return {
      type,
      amount: prefill?.amount ?? "",
      transactionDate: todayDateOnly(),
      owner: prefill?.owner === "BROTHER" ? "BROTHER" : "SELF",
      paymentMode: flow.sign === "neutral" ? "TRANSFER" : "CASH",
      notes: prefill?.notes ?? "",
      fromAccountId: flow.from === "required" ? validAccount(prefill?.fromAccountId, flow.fromKind) : "",
      toAccountId: flow.to === "required" ? validAccount(prefill?.toAccountId, flow.toKind) : "",
      categoryId: flow.category !== "none" ? validCategory(prefill?.categoryId, type) || tradingProfitCategory(type) || "" : "",
      personId: flow.loan === "creates" && people.some((p) => p.id === prefill?.personId) ? prefill!.personId! : "",
      personName: "",
      loanId: flow.loan === "repays" ? (loan?.id ?? "") : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<TransactionInput, unknown, TransactionData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: defaults,
    mode: "onSubmit",
  });
  const { register, watch, setValue, setError, handleSubmit, formState, reset, getValues } = form;
  const { errors } = formState;

  const type = watch("type") as TransactionType;
  const fromAccountId = watch("fromAccountId") ?? "";
  const toAccountId = watch("toAccountId") ?? "";
  const personId = watch("personId") ?? "";
  const loanId = watch("loanId") ?? "";
  const owner = watch("owner") as Owner;
  const paymentMode = watch("paymentMode") as PaymentMode;
  const flow = TRANSACTION_FLOWS[type];
  const group = TRANSACTION_TYPE_GROUP[type];
  const groupDef = TRANSACTION_GROUPS.find((g) => g.value === group)!;

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const primaryAccount = flow.sign === "out" ? fromAccount : flow.sign === "in" ? toAccount : fromAccount;
  const tradingAccount = [fromAccount, toAccount].find((a) => a?.type === "TRADING");
  const ownerLocked = (flow.fromKind === "TRADING" || flow.toKind === "TRADING") && !!tradingAccount;

  // Apply remembered account/category after mount (localStorage is client-only) when nothing was prefilled.
  useEffect(() => {
    if (mode !== "create" || hasPrefillIds) return;
    const r = readRemembered(defaults.type as TransactionType);
    const f = TRANSACTION_FLOWS[defaults.type as TransactionType];
    if (f.from === "required" && !getValues("fromAccountId")) setValue("fromAccountId", validAccount(r.fromAccountId, f.fromKind));
    if (f.to === "required" && !getValues("toAccountId")) setValue("toAccountId", validAccount(r.toAccountId, f.toKind));
    if (f.category !== "none" && !getValues("categoryId")) setValue("categoryId", validCategory(r.categoryId, defaults.type as TransactionType));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive owner / payment mode from the chosen accounts unless the user overrode them.
  useEffect(() => {
    if (ownerLocked && tradingAccount) {
      if (getValues("owner") !== tradingAccount.owner) setValue("owner", tradingAccount.owner);
    } else if (!ownerTouched.current && primaryAccount && getValues("owner") !== primaryAccount.owner) {
      setValue("owner", primaryAccount.owner);
    }
    if (!modeTouched.current) {
      const next: PaymentMode =
        flow.sign === "neutral" ? "TRANSFER" : primaryAccount ? ACCOUNT_TYPE_PAYMENT_MODE[primaryAccount.type] : getValues("paymentMode");
      if (getValues("paymentMode") !== next) setValue("paymentMode", next);
    }
  }, [fromAccountId, toAccountId, type, ownerLocked, tradingAccount, primaryAccount, flow.sign, getValues, setValue]);

  const applyType = (next: TransactionType) => {
    const nf = TRANSACTION_FLOWS[next];
    const remembered = readRemembered(next);
    setValue("type", next);
    // Accounts: drop anything the new flow forbids or that is of the wrong kind; fall back to remembered ids.
    setValue("fromAccountId", nf.from === "required" ? validAccount(getValues("fromAccountId"), nf.fromKind) || validAccount(remembered.fromAccountId, nf.fromKind) : "");
    setValue("toAccountId", nf.to === "required" ? validAccount(getValues("toAccountId"), nf.toKind) || validAccount(remembered.toAccountId, nf.toKind) : "");
    if (nf.category === "none") setValue("categoryId", "");
    else {
      setValue(
        "categoryId",
        validCategory(getValues("categoryId"), next) || tradingProfitCategory(next) || validCategory(remembered.categoryId, next),
      );
    }
    if (nf.loan !== "creates") {
      setValue("personId", "");
      setValue("personName", "");
      setNewPerson(false);
    }
    if (nf.loan !== "repays") setValue("loanId", "");
    else {
      const current = loans.find((l) => l.id === getValues("loanId"));
      if (!current || REPAYMENT_TYPE_FOR_DIRECTION[current.direction] !== next) setValue("loanId", "");
    }
    form.clearErrors();
  };

  const applyGroup = (g: TransactionGroup) => {
    const def = TRANSACTION_GROUPS.find((x) => x.value === g)!;
    if (!def.types.includes(type)) applyType(def.types[0]);
  };

  const keepFrom = mode === "edit" ? transaction?.fromAccountId : null;
  const keepTo = mode === "edit" ? transaction?.toAccountId : null;
  const fromGroups = useMemo(() => accountGroups(accounts, flow.fromKind, keepFrom), [accounts, flow.fromKind, keepFrom]);
  const toGroups = useMemo(() => accountGroups(accounts, flow.toKind, keepTo), [accounts, flow.toKind, keepTo]);
  const keepCategory = mode === "edit" ? transaction?.categoryId : null;
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => (c.isActive || c.id === keepCategory) && (!flow.categoryType || c.type === flow.categoryType))
        .map((c) => ({ value: c.id, label: `${c.icon ? c.icon + " " : ""}${c.name}${c.isActive ? "" : " (disabled)"}` })),
    [categories, flow.categoryType, keepCategory],
  );
  const repaymentLoans = useMemo(
    () => loans.filter((l) => l.status === "ACTIVE" && REPAYMENT_TYPE_FOR_DIRECTION[l.direction] === type),
    [loans, type],
  );
  const selectedLoan = loans.find((l) => l.id === loanId);

  const onSubmit = handleSubmit(
    (values) => {
      setFormError(null);
      startTransition(async () => {
        const payload: TransactionInput = { ...values, personId: values.personId === NEW_PERSON ? "" : values.personId };
        const res =
          mode === "edit" && transaction ? await updateTransactionAction(transaction.id, payload) : await createTransactionAction(payload);
        if (!res.ok) {
          addAnother.current = false;
          for (const [field, msgs] of Object.entries(res.fieldErrors ?? {})) {
            if (field in defaults) setError(field as keyof TransactionInput, { message: msgs[0] });
          }
          setFormError(res.error);
          toast.error(res.error);
          return;
        }
        remember(values.type, payload);
        if (mode === "edit") {
          toast.success("Transaction updated");
          router.push(returnTo);
          router.refresh();
          return;
        }
        toast.success(`${TRANSACTION_TYPE_LABELS[values.type]} saved`);
        if (addAnother.current) {
          addAnother.current = false;
          reset({ ...getValues(), amount: "", notes: "" });
          router.refresh();
          amountRef.current?.focus();
          return;
        }
        router.push(returnTo);
        router.refresh();
      });
    },
    () => {
      addAnother.current = false;
    },
  );

  const amountField = register("amount");
  const today = todayDateOnly();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* Type selector */}
      {loanLocked ? (
        <div className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">{TRANSACTION_TYPE_LABELS[type]}</span> — the type of a loan transaction
            cannot be changed. Delete it and record a new one instead.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <SegmentedControl<TransactionGroup>
            aria-label="Transaction kind"
            fullWidth
            options={TRANSACTION_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
            value={group}
            onChange={applyGroup}
          />
          {groupDef.types.length > 1 ? (
            <SegmentedControl<TransactionType>
              aria-label="Transaction type"
              fullWidth
              size="sm"
              options={groupDef.types.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))}
              value={type}
              onChange={applyType}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">{flow.description}</p>
        </div>
      )}

      <FormError message={formError} />

      {/* Amount */}
      <Field id="amount" label="Amount" error={errors.amount?.message} required>
        <AmountInput
          id="amount"
          size="xl"
          autoFocus={mode === "create"}
          invalid={!!errors.amount}
          {...amountField}
          ref={(el) => {
            amountField.ref(el);
            amountRef.current = el;
          }}
        />
      </Field>

      {/* Accounts */}
      {flow.from === "required" ? (
        <Field id="fromAccountId" label={ACCOUNT_LABELS[type]?.from ?? "From account"} error={errors.fromAccountId?.message} required>
          <NativeSelect
            id="fromAccountId"
            placeholder="Choose account"
            groups={fromGroups}
            aria-invalid={!!errors.fromAccountId}
            {...register("fromAccountId")}
          />
        </Field>
      ) : null}
      {flow.to === "required" ? (
        <Field id="toAccountId" label={ACCOUNT_LABELS[type]?.to ?? "To account"} error={errors.toAccountId?.message} required>
          <NativeSelect
            id="toAccountId"
            placeholder="Choose account"
            groups={toGroups}
            aria-invalid={!!errors.toAccountId}
            {...register("toAccountId")}
          />
        </Field>
      ) : null}
      {(flow.from === "required" && fromGroups.length === 0) || (flow.to === "required" && toGroups.length === 0) ? (
        <p className="rounded-xl bg-loan/15 px-3 py-2 text-xs text-foreground">
          No suitable account exists yet.{" "}
          {flow.fromKind === "TRADING" || flow.toKind === "TRADING"
            ? "Create a Trading account (type: Trading) first."
            : "Create an account first."}{" "}
          <Link href="/accounts" className="font-medium underline">
            Go to Accounts
          </Link>
        </p>
      ) : null}

      {/* Category */}
      {flow.category !== "none" ? (
        <Field
          id="categoryId"
          label={flow.category === "required" ? "Category" : "Category (optional)"}
          error={errors.categoryId?.message}
          required={flow.category === "required"}
        >
          <NativeSelect
            id="categoryId"
            placeholder={flow.category === "required" ? "Choose category" : "No category"}
            options={categoryOptions}
            aria-invalid={!!errors.categoryId}
            {...register("categoryId")}
          />
        </Field>
      ) : null}

      {/* Person (borrow / lend) */}
      {flow.loan === "creates" ? (
        <Field id="personId" label={type === "BORROW" ? "Borrowed from" : "Lent to"} error={errors.personId?.message} required>
          <div className="flex flex-col gap-2">
            {loanLocked ? (
              <Input id="personId" value={transaction?.loan?.personName ?? ""} readOnly className="h-11 rounded-xl" />
            ) : (
              <NativeSelect
                id="personId"
                placeholder="Choose person"
                options={[...people.map((p) => ({ value: p.id, label: p.name })), { value: NEW_PERSON, label: "+ New person…" }]}
                aria-invalid={!!errors.personId}
                value={newPerson ? NEW_PERSON : personId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === NEW_PERSON) {
                    setNewPerson(true);
                    setValue("personId", "");
                  } else {
                    setNewPerson(false);
                    setValue("personId", v);
                    setValue("personName", "");
                  }
                }}
              />
            )}
            {newPerson ? (
              <Input
                placeholder="Person's name"
                autoFocus
                className="h-11 rounded-xl"
                aria-label="New person name"
                {...register("personName")}
              />
            ) : null}
          </div>
        </Field>
      ) : null}

      {/* Loan (repayments) */}
      {flow.loan === "repays" ? (
        <Field
          id="loanId"
          label="Loan"
          error={errors.loanId?.message}
          required
          hint={
            selectedLoan
              ? `Outstanding ${formatINR(selectedLoan.outstandingAmount)} · you can repay up to this amount`
              : repaymentLoans.length === 0
                ? `No active ${type === "LOAN_REPAYMENT" ? "borrowings" : "lendings"} to repay.`
                : undefined
          }
        >
          <NativeSelect
            id="loanId"
            placeholder="Choose loan"
            disabled={loanLocked}
            options={repaymentLoans
              .concat(selectedLoan && !repaymentLoans.some((l) => l.id === selectedLoan.id) ? [selectedLoan] : [])
              .map((l) => ({
                value: l.id,
                label: `${l.personName} · ${formatINR(l.outstandingAmount)} left (of ${formatINR(l.originalAmount)})`,
              }))}
            aria-invalid={!!errors.loanId}
            {...register("loanId")}
          />
        </Field>
      ) : null}

      {/* Owner */}
      <Field
        id="owner"
        label="Owner"
        error={errors.owner?.message}
        hint={ownerLocked && tradingAccount ? `Set by ${tradingAccount.name}` : "Whose money this is"}
      >
        <SegmentedControl<Owner>
          aria-label="Owner"
          fullWidth
          options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))}
          value={owner}
          onChange={(v) => {
            if (ownerLocked) return;
            ownerTouched.current = true;
            setValue("owner", v);
          }}
          className={cn(ownerLocked && "pointer-events-none opacity-70")}
        />
      </Field>

      {/* Payment mode */}
      <Field id="paymentMode" label="Payment mode" error={errors.paymentMode?.message}>
        <SegmentedControl<PaymentMode>
          aria-label="Payment mode"
          fullWidth
          size="sm"
          options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          value={paymentMode}
          onChange={(v) => {
            modeTouched.current = true;
            setValue("paymentMode", v);
          }}
        />
      </Field>

      {/* Date */}
      <Field id="transactionDate" label="Date" error={errors.transactionDate?.message} required>
        <div className="flex flex-col gap-2">
          <DateInput id="transactionDate" aria-invalid={!!errors.transactionDate} {...register("transactionDate")} />
          <div className="flex gap-2">
            {[
              { label: "Today", value: today },
              { label: "Yesterday", value: addDays(today, -1) },
            ].map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setValue("transactionDate", c.value, { shouldValidate: true })}
                className={cn(
                  "h-8 rounded-lg border px-3 text-xs font-medium transition-colors",
                  watch("transactionDate") === c.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </Field>

      {/* Notes */}
      <Field id="notes" label="Notes (optional)" error={errors.notes?.message}>
        <Textarea id="notes" rows={2} placeholder="What was this for?" className="rounded-xl" {...register("notes")} />
      </Field>

      {/* Submit bar */}
      <div className="sticky bottom-20 z-10 -mx-1 flex flex-col gap-2 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur md:bottom-4">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-12 w-full rounded-xl text-base"
          onClick={() => {
            addAnother.current = false;
          }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitLabel(type, mode)}
        </Button>
        {mode === "create" ? (
          <Button
            type="submit"
            variant="outline"
            size="lg"
            disabled={pending}
            className="h-11 w-full rounded-xl"
            onClick={() => {
              addAnother.current = true;
            }}
          >
            Save &amp; add another
          </Button>
        ) : null}
      </div>
    </form>
  );
}
