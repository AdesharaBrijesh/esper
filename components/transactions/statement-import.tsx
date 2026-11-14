"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import {
  confirmStatementImportAction,
  confirmTradingImportAction,
  previewStatementAction,
  type ImportPreview,
} from "@/lib/actions/statement-import";
import type { PreviewRow, TradingPreviewRow } from "@/lib/services/statement-import";
import { TRADING_KINDS, type TradingKind } from "@/lib/calculations/ai-statement";
import { compressImage, formatBytes } from "@/lib/client/compress-image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ChipSelect } from "@/components/shared/chip-select";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateOnly } from "@/lib/dates";
import { formatINR, parseMoneyInput } from "@/lib/money";
import {
  ACCOUNT_TYPE_PAYMENT_MODE,
  isPortfolioAccount,
  OWNER_LABELS,
  OWNERS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type Owner,
  type PaymentMode,
} from "@/lib/constants";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "bank" | "trading";
type ImportResult = { created: number; failed: { index: number; error: string }[] };

interface EditableBankRow extends PreviewRow {
  include: boolean;
  categoryId: string;
}
interface EditableTradingRow extends TradingPreviewRow {
  include: boolean;
}

const MAX_TOTAL = 4.4 * 1024 * 1024;
const ACCEPT = ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,application/pdf,image/*,.heic,.heif";

const KIND_LABELS: Record<TradingKind, string> = {
  profit: "Profit",
  loss: "Loss",
  charges: "Charges",
  deposit: "Funds added",
  withdrawal: "Withdrawn",
};
const KIND_TONE: Record<TradingKind, "income" | "expense" | "neutral"> = {
  profit: "income",
  loss: "expense",
  charges: "expense",
  deposit: "neutral",
  withdrawal: "neutral",
};

function fileIcon(f: File) {
  if (f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)) return ImageIcon;
  if (/\.(csv|xlsx|xls)$/i.test(f.name)) return FileSpreadsheet;
  return FileText;
}

/** A borderless inline input that only shows its edges on hover/focus. */
function InlineInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-7 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 outline-none transition-colors",
        "hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/40",
        "aria-invalid:border-destructive",
        className,
      )}
    />
  );
}

/** Date chip with the native picker on top. */
function DateChip({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="relative inline-flex h-7 shrink-0 items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground tabular hover:bg-muted focus-within:ring-3 focus-within:ring-ring/40">
      {formatDateOnly(value, { withYear: false })}
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </span>
  );
}

export function StatementImportWizard({
  accounts,
  categories,
  aiEnabled,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [mode, setMode] = useState<Mode>("bank");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [useAi, setUseAi] = useState(aiEnabled);
  const [error, setError] = useState<string | null>(null);

  const bankAccounts = useMemo(() => accounts.filter((a) => a.isActive && !isPortfolioAccount(a.type)), [accounts]);
  const tradingAccounts = useMemo(() => accounts.filter((a) => a.isActive && a.type === "TRADING"), [accounts]);
  // A statement is usually for the bank account (BOB first), not cash.
  const [bankAccountId, setBankAccountId] = useState(
    () =>
      (
        bankAccounts.find((a) => /\b(bob|baroda)\b/i.test(`${a.name} ${a.institution ?? ""}`)) ??
        bankAccounts.find((a) => a.type === "BANK") ??
        bankAccounts[0]
      )?.id ?? "",
  );
  const [tradingAccountId, setTradingAccountId] = useState(tradingAccounts[0]?.id ?? "");
  // Trading mode: which bank account deposits come from / withdrawals land in.
  const [fundsAccountId, setFundsAccountId] = useState(() => {
    const owner = tradingAccounts[0]?.owner ?? "SELF";
    const banks = bankAccounts.filter((a) => a.type === "BANK" && a.owner === owner);
    return (banks.find((a) => /\b(bob|baroda)\b/i.test(`${a.name} ${a.institution ?? ""}`)) ?? banks[0] ?? bankAccounts[0])?.id ?? "";
  });

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [bankRows, setBankRows] = useState<EditableBankRow[]>([]);
  const [tradeRows, setTradeRows] = useState<EditableTradingRow[]>([]);
  const [owner, setOwner] = useState<Owner>("SELF");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("BANK");
  const [result, setResult] = useState<ImportResult | null>(null);

  const expenseCats = useMemo(() => categories.filter((c) => c.isActive && c.type === "EXPENSE"), [categories]);
  const incomeCats = useMemo(() => categories.filter((c) => c.isActive && c.type === "INCOME"), [categories]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c] as const)), [categories]);

  const totalSize = files.reduce((n, f) => n + f.size, 0);
  const needsAi = mode === "trading" || files.some((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
  const accountId = mode === "bank" ? bankAccountId : tradingAccountId;

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    const incoming = await Promise.all([...list].map((f) => compressImage(f)));
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))].slice(0, 10);
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  const reset = () => {
    setStep("upload");
    setPreview(null);
    setBankRows([]);
    setTradeRows([]);
    setResult(null);
    setFiles([]);
    setError(null);
  };

  const onRead = () => {
    if (files.length === 0) return setError("Add a file first.");
    if (!accountId) return setError(mode === "bank" ? "Choose which account this is for." : "Choose your trading account.");
    if (totalSize > MAX_TOTAL) return setError(`That's ${formatBytes(totalSize)}. Keep one upload under about 4MB by splitting it.`);
    if (needsAi && !(aiEnabled && (useAi || mode === "trading"))) {
      return setError(mode === "trading" ? "Broker reports need AI reading, which isn't set up." : "Photos need AI reading. Turn it on above.");
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("mode", mode);
      fd.set("accountId", accountId);
      fd.set("useAi", useAi || mode === "trading" ? "1" : "0");
      for (const f of files) fd.append("file", f);
      const res = await previewStatementAction(fd);
      if (!res.ok) return setError(res.error);
      const data = res.data;
      setPreview(data);
      if (data.rows.length === 0) {
        setError(data.note ? `Nothing to import. ${data.note}` : "Nothing to import was found in that file.");
        return;
      }
      if (data.mode === "bank") {
        const chosen = accounts.find((a) => a.id === bankAccountId);
        setOwner(chosen?.owner ?? "SELF");
        // Screenshots come from UPI apps; a bank statement's own mode otherwise.
        const fromScreenshots = files.some((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
        setPaymentMode(chosen ? (fromScreenshots && chosen.type === "BANK" ? "UPI" : ACCOUNT_TYPE_PAYMENT_MODE[chosen.type]) : "BANK");
        setBankRows(data.rows.map((r) => ({ ...r, include: !r.possibleDuplicate, categoryId: r.suggestedCategoryId ?? "" })));
      } else {
        setTradeRows(data.rows.map((r) => ({ ...r, include: !r.possibleDuplicate })));
      }
      setStep("review");
    });
  };

  // ---------------------------------------------------------------- review math
  const selBank = bankRows.filter((r) => r.include);
  const selTrade = tradeRows.filter((r) => r.include);
  const num = (s: string) => Number(parseMoneyInput(s)?.toFixed(2) ?? 0);
  const badAmounts = (mode === "bank" ? selBank : selTrade).filter((r) => !parseMoneyInput(r.amount)?.greaterThan(0)).length;
  const missingCategory = selBank.filter((r) => !r.categoryId).length;
  const tradingNeedsFunds = selTrade.some((r) => r.kind === "deposit" || r.kind === "withdrawal");

  const bankOut = selBank.filter((r) => r.direction === "debit").reduce((s, r) => s + num(r.amount), 0);
  const bankIn = selBank.filter((r) => r.direction === "credit").reduce((s, r) => s + num(r.amount), 0);
  const netPnl = selTrade.reduce((s, r) => s + (r.kind === "profit" ? 1 : r.kind === "loss" || r.kind === "charges" ? -1 : 0) * num(r.amount), 0);

  const patchBank = (index: number, patch: Partial<EditableBankRow>) =>
    setBankRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  const patchTrade = (index: number, patch: Partial<EditableTradingRow>) =>
    setTradeRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...patch } : r)));

  const allSelected = mode === "bank" ? bankRows.every((r) => r.include) : tradeRows.every((r) => r.include);
  const toggleAll = () => {
    if (mode === "bank") setBankRows((p) => p.map((r) => ({ ...r, include: !allSelected })));
    else setTradeRows((p) => p.map((r) => ({ ...r, include: !allSelected })));
  };

  const onConfirm = () => {
    const count = mode === "bank" ? selBank.length : selTrade.length;
    if (count === 0) return setError("Select at least one row.");
    if (badAmounts > 0) return setError(`${badAmounts} selected row${badAmounts === 1 ? " has" : "s have"} an invalid amount.`);
    if (mode === "bank" && missingCategory > 0) return setError(`${missingCategory} selected row${missingCategory === 1 ? "" : "s"} still need a category.`);
    if (mode === "trading" && tradingNeedsFunds && !fundsAccountId) return setError("Choose the bank account for fund transfers.");
    setError(null);
    startTransition(async () => {
      const res =
        mode === "bank"
          ? await confirmStatementImportAction({
              accountId: bankAccountId,
              owner,
              paymentMode,
              rows: selBank.map((r) => ({ date: r.date, description: r.description, amount: r.amount, direction: r.direction, categoryId: r.categoryId })),
            })
          : await confirmTradingImportAction({
              tradingAccountId,
              bankAccountId: tradingNeedsFunds ? fundsAccountId : "",
              rows: selTrade.map((r) => ({ date: r.date, kind: r.kind, amount: r.amount, description: r.description })),
            });
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setStep("done");
      if (res.data.failed.length === 0) toast.success(`Added ${res.data.created} entr${res.data.created === 1 ? "y" : "ies"}`);
      else toast.warning(`Added ${res.data.created}, ${res.data.failed.length} failed`);
      router.refresh();
    });
  };

  // ---------------------------------------------------------------- empty states
  if (bankAccounts.length === 0 && tradingAccounts.length === 0) {
    return (
      <EmptyState
        icon="🏦"
        title="No accounts yet"
        description="Create an account first. Imported entries need somewhere to go."
        action={
          <Button size="lg" className="h-11 rounded-xl" render={<Link href="/accounts" />}>
            Go to accounts
          </Button>
        }
      />
    );
  }

  // ---------------------------------------------------------------- done
  if (step === "done" && result) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-5 py-8 text-center">
        <CheckCircle2 className="size-10 text-income" aria-hidden />
        <div>
          <p className="text-lg font-semibold">
            {result.created} entr{result.created === 1 ? "y" : "ies"} added
          </p>
          {result.failed.length > 0 ? <p className="text-sm text-destructive">{result.failed.length} couldn&apos;t be added</p> : null}
        </div>
        {result.failed.length > 0 ? (
          <ul className="flex w-full flex-col gap-1 rounded-xl bg-muted/60 p-3 text-left text-xs">
            {result.failed.map((f) => (
              <li key={f.index}>
                Row {f.index + 1}: {f.error}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex w-full max-w-sm gap-2">
          <Button size="lg" className="h-11 flex-1 rounded-xl" render={<Link href={mode === "trading" ? "/trading" : "/transactions"} />}>
            {mode === "trading" ? "Open trading" : "View activity"}
          </Button>
          <Button variant="outline" size="lg" className="h-11 flex-1 rounded-xl" onClick={reset}>
            Import more
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- review
  if (step === "review" && preview) {
    const skipped = preview.skipped;
    const count = mode === "bank" ? selBank.length : selTrade.length;
    const total = mode === "bank" ? bankRows.length : tradeRows.length;
    return (
      <div className="flex flex-col gap-3">
        <FormError message={error} />

        {preview.usedAi || preview.note ? (
          <div className="flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2.5 text-xs text-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <p>
              {preview.usedAi ? "Read by AI. Check the amounts and dates before adding." : null} {preview.note}
            </p>
          </div>
        ) : null}

        {skipped.length > 0 ? (
          <details className="rounded-xl bg-loan/12 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">
              {skipped.length} line{skipped.length === 1 ? "" : "s"} skipped
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
              {skipped.slice(0, 60).map((s, i) => (
                <li key={i}>
                  {s.line > 0 ? `Line ${s.line}: ` : ""}
                  {s.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {/* Settings */}
        {mode === "bank" ? (
          <div className="grid grid-cols-1 gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
            <Field id="imp-owner" label="Owner">
              <SegmentedControl<Owner> aria-label="Owner" fullWidth options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))} value={owner} onChange={setOwner} />
            </Field>
            <Field id="imp-mode" label="Payment mode">
              <NativeSelect id="imp-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
            </Field>
          </div>
        ) : tradingNeedsFunds ? (
          <div className="rounded-2xl border bg-card p-4">
            <Field id="imp-funds" label="Funds moved to / from" hint="Deposits come out of this account, withdrawals land in it.">
              <NativeSelect
                id="imp-funds"
                value={fundsAccountId}
                onChange={(e) => setFundsAccountId(e.target.value)}
                placeholder="Choose bank account"
                options={bankAccounts.map((a) => ({ value: a.id, label: `${a.name} (${OWNER_LABELS[a.owner]})` }))}
              />
            </Field>
          </div>
        ) : null}

        {/* Rows */}
        <section className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
              {count} of {total} selected
            </label>
            {mode === "trading" ? (
              <span className="text-xs text-muted-foreground">
                Net P&amp;L <Money value={netPnl.toFixed(2)} tone={netPnl >= 0 ? "income" : "expense"} signed className="font-semibold" />
              </span>
            ) : null}
          </div>
          <ul className="divide-y">
            {mode === "bank"
              ? bankRows.map((r) => {
                  const cats = r.direction === "debit" ? expenseCats : incomeCats;
                  const cat = catById.get(r.categoryId);
                  return (
                    <li key={r.index} className={cn("flex items-start gap-2.5 px-3 py-2.5 transition-opacity", !r.include && "opacity-45")}>
                      <Checkbox className="mt-1.5" checked={r.include} onCheckedChange={(v) => patchBank(r.index, { include: v === true })} aria-label={`Include ${r.description}`} />
                      <div className="min-w-0 flex-1">
                        <InlineInput
                          aria-label="Description"
                          value={r.description}
                          maxLength={200}
                          onChange={(e) => patchBank(r.index, { description: e.target.value })}
                          className="-ml-1.5 w-full text-sm font-medium"
                        />
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                          <DateChip value={r.date} label={`Date for ${r.description}`} onChange={(v) => patchBank(r.index, { date: v })} />
                          <ChipSelect
                            label={cat ? cat.name : "Category"}
                            dotColor={cat?.color}
                            tone={r.categoryId ? "default" : "warn"}
                            value={r.categoryId}
                            ariaLabel={`Category for ${r.description}`}
                            options={cats.map((c) => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ""}${c.name}` }))}
                            onChange={(v) => patchBank(r.index, { categoryId: v })}
                          />
                          {r.possibleDuplicate ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                              <AlertTriangle className="size-3" aria-hidden /> Already added?
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className={cn("flex shrink-0 items-center text-sm font-semibold", r.direction === "debit" ? "text-expense" : "text-income")}>
                        <span aria-hidden>{r.direction === "debit" ? "−₹" : "+₹"}</span>
                        <InlineInput
                          aria-label="Amount"
                          inputMode="decimal"
                          value={r.amount}
                          aria-invalid={!parseMoneyInput(r.amount)?.greaterThan(0) || undefined}
                          onChange={(e) => patchBank(r.index, { amount: e.target.value })}
                          className="tabular w-20 min-w-10 text-right supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:[field-sizing:content]"
                        />
                      </div>
                    </li>
                  );
                })
              : tradeRows.map((r) => (
                  <li key={r.index} className={cn("flex items-start gap-2.5 px-3 py-2.5 transition-opacity", !r.include && "opacity-45")}>
                    <Checkbox className="mt-1.5" checked={r.include} onCheckedChange={(v) => patchTrade(r.index, { include: v === true })} aria-label={`Include ${r.description}`} />
                    <div className="min-w-0 flex-1">
                      <InlineInput
                        aria-label="Description"
                        value={r.description}
                        maxLength={200}
                        onChange={(e) => patchTrade(r.index, { description: e.target.value })}
                        className="-ml-1.5 w-full text-sm font-medium"
                      />
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <DateChip value={r.date} label={`Date for ${r.description}`} onChange={(v) => patchTrade(r.index, { date: v })} />
                        <ChipSelect
                          label={KIND_LABELS[r.kind]}
                          value={r.kind}
                          ariaLabel={`Kind for ${r.description}`}
                          options={TRADING_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
                          onChange={(v) => patchTrade(r.index, { kind: v as TradingKind })}
                          className={cn(KIND_TONE[r.kind] === "income" && "text-income", KIND_TONE[r.kind] === "expense" && "text-expense")}
                        />
                        {r.possibleDuplicate ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                            <AlertTriangle className="size-3" aria-hidden /> Already added?
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex shrink-0 items-center text-sm font-semibold",
                        KIND_TONE[r.kind] === "income" ? "text-income" : KIND_TONE[r.kind] === "expense" ? "text-expense" : "text-foreground",
                      )}
                    >
                      <span aria-hidden>{KIND_TONE[r.kind] === "income" ? "+₹" : KIND_TONE[r.kind] === "expense" ? "−₹" : "₹"}</span>
                      <InlineInput
                        aria-label="Amount"
                        inputMode="decimal"
                        value={r.amount}
                        aria-invalid={!parseMoneyInput(r.amount)?.greaterThan(0) || undefined}
                        onChange={(e) => patchTrade(r.index, { amount: e.target.value })}
                        className="tabular w-20 min-w-10 text-right supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:[field-sizing:content]"
                      />
                    </div>
                  </li>
                ))}
          </ul>
        </section>

        <div className="sticky bottom-20 z-10 flex items-center gap-2 rounded-2xl border bg-background/95 p-2 pl-4 shadow-lg backdrop-blur md:bottom-4">
          <div className="min-w-0 flex-1 text-xs text-muted-foreground">
            {mode === "bank" ? (
              <p className="flex flex-wrap gap-x-3">
                <span>
                  Out <Money value={bankOut.toFixed(2)} tone="expense" className="font-semibold" />
                </span>
                <span>
                  In <Money value={bankIn.toFixed(2)} tone="income" className="font-semibold" />
                </span>
              </p>
            ) : (
              <p>
                Net <Money value={netPnl.toFixed(2)} signed tone={netPnl >= 0 ? "income" : "expense"} className="font-semibold" />
              </p>
            )}
            <p className="truncate">{count} to add</p>
          </div>
          <Button variant="ghost" size="lg" className="h-12 rounded-xl" disabled={pending} onClick={() => setStep("upload")}>
            Back
          </Button>
          <Button size="lg" className="h-12 rounded-xl px-5" disabled={pending || count === 0} onClick={onConfirm}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Add {count}
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- upload
  const accountList = mode === "bank" ? bankAccounts : tradingAccounts;
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<Mode>
        aria-label="What are you importing"
        fullWidth
        size="lg"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
        options={[
          { value: "bank", label: "Bank / UPI" },
          { value: "trading", label: "Angel One" },
        ]}
      />

      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        {accountList.length === 0 ? (
          <p className="rounded-xl bg-loan/12 px-3 py-2.5 text-sm">
            {mode === "trading" ? "Add an account of type Trading for Angel One first." : "Add a bank or cash account first."}{" "}
            <Link href="/accounts" className="font-medium underline underline-offset-2">
              Accounts
            </Link>
          </p>
        ) : (
          <Field id="imp-account" label={mode === "bank" ? "Statement is for" : "Trading account"} required>
            <NativeSelect
              id="imp-account"
              value={accountId}
              onChange={(e) => (mode === "bank" ? setBankAccountId(e.target.value) : setTradingAccountId(e.target.value))}
              options={accountList.map((a) => ({ value: a.id, label: `${a.name} (${OWNER_LABELS[a.owner]}) · ${formatINR(a.balance)}` }))}
            />
          </Field>
        )}

        <div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "press flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{files.length ? "Add more files" : "Choose files or drop them here"}</span>
            <span className="text-xs text-muted-foreground">
              {mode === "bank"
                ? "Bank statement (CSV, Excel, PDF) or UPI screenshots"
                : "P&L statement, tradebook, ledger or app screenshots"}
            </span>
          </button>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void addFiles(e.target.files)} />
        </div>

        {files.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => {
              const Icon = fileIcon(f);
              return (
                <li key={`${f.name}:${f.size}`} className="flex items-center gap-2.5 rounded-xl bg-muted/50 py-1.5 pr-1.5 pl-3 text-sm">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {aiEnabled ? (
          mode === "bank" ? (
            <label className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5">
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-3.5 text-primary" aria-hidden /> Read with AI
                </span>
                <span className="block text-xs text-muted-foreground">
                  For photos, screenshots and PDFs. CSV and Excel are read exactly without it.
                </span>
              </span>
              <Switch checked={useAi} onCheckedChange={setUseAi} aria-label="Read with AI" />
            </label>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-primary/8 px-3 py-2.5 text-xs">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              <span>
                AI reads the report and turns it into profit, loss, charges and fund entries for your trading account. You review every
                one before it&apos;s added.
              </span>
            </p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            {mode === "trading"
              ? "Reading broker reports needs a Gemini API key on the server (GEMINI_API_KEY)."
              : "CSV, Excel and text PDFs work as is. Add a Gemini API key on the server to also read photos and scanned PDFs."}
          </p>
        )}

        <FormError message={error} />

        <Button size="lg" className="h-12 rounded-xl" disabled={pending || files.length === 0 || accountList.length === 0} onClick={onRead}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? (needsAi || (useAi && aiEnabled) ? "Reading… this can take up to a minute" : "Reading…") : "Read files"}
        </Button>
      </div>
    </div>
  );
}
