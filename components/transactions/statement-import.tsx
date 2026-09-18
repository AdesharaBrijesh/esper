"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Upload } from "lucide-react";
import { previewStatementAction, confirmStatementImportAction } from "@/lib/actions/statement-import";
import type { PreviewRow, StatementPreview } from "@/lib/services/statement-import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Field, FormError } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Money } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateOnly } from "@/lib/dates";
import { ACCOUNT_TYPE_PAYMENT_MODE, OWNER_LABELS, OWNERS, PAYMENT_MODE_LABELS, PAYMENT_MODES, type Owner, type PaymentMode } from "@/lib/constants";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EditableRow extends PreviewRow {
  include: boolean;
  categoryId: string;
}

function accountLabel(a: AccountDTO): string {
  return `${a.name} (${OWNER_LABELS[a.owner]})`;
}

export function StatementImportWizard({ accounts, categories }: { accounts: AccountDTO[]; categories: CategoryDTO[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [owner, setOwner] = useState<Owner>("SELF");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("BANK");
  const [result, setResult] = useState<{ created: number; failed: { index: number; error: string }[] } | null>(null);

  const expenseCategories = useMemo(() => categories.filter((c) => c.isActive && c.type === "EXPENSE"), [categories]);
  const incomeCategories = useMemo(() => categories.filter((c) => c.isActive && c.type === "INCOME"), [categories]);

  const onUpload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV or PDF file first.");
      return;
    }
    if (!accountId) {
      setError("Choose which account this statement is for.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("accountId", accountId);
      fd.set("file", file);
      const res = await previewStatementAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data.rows.length === 0) {
        setError("No usable rows found in that file — check the skipped-rows list below for why.");
        setPreview(res.data);
        return;
      }
      const chosen = accounts.find((a) => a.id === accountId);
      setOwner(chosen?.owner ?? "SELF");
      setPaymentMode(chosen ? ACCOUNT_TYPE_PAYMENT_MODE[chosen.type] : "BANK");
      setPreview(res.data);
      setRows(
        res.data.rows.map((r) => ({
          ...r,
          include: !r.possibleDuplicate,
          categoryId: r.suggestedCategoryId ?? "",
        })),
      );
      setStep("review");
    });
  };

  const selected = rows.filter((r) => r.include);
  const totalDebit = selected.filter((r) => r.direction === "debit").reduce((s, r) => s + Number(r.amount), 0);
  const totalCredit = selected.filter((r) => r.direction === "credit").reduce((s, r) => s + Number(r.amount), 0);
  const missingCategory = selected.filter((r) => !r.categoryId).length;

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...patch } : r)));
  };

  const onConfirm = () => {
    if (missingCategory > 0) {
      setError(`${missingCategory} selected row${missingCategory === 1 ? "" : "s"} still need a category.`);
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one row to import.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await confirmStatementImportAction({
        accountId,
        owner,
        paymentMode,
        rows: selected.map((r) => ({
          date: r.date,
          description: r.description,
          amount: r.amount,
          direction: r.direction,
          categoryId: r.categoryId,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
      setStep("done");
      if (res.data.failed.length === 0) toast.success(`Added ${res.data.created} transactions`);
      else toast.warning(`Added ${res.data.created}, ${res.data.failed.length} failed — see details below`);
      router.refresh();
    });
  };

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="🏦"
        title="No accounts yet"
        description="Create an account first — a statement import needs somewhere to attach the transactions to."
        action={
          <Button size="lg" className="h-11 rounded-xl" render={<Link href="/accounts" />}>
            Go to accounts
          </Button>
        }
      />
    );
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-8 text-income" aria-hidden />
          <div>
            <p className="font-semibold">{result.created} transactions added</p>
            {result.failed.length > 0 ? (
              <p className="text-sm text-destructive">{result.failed.length} row(s) failed</p>
            ) : null}
          </div>
        </div>
        {result.failed.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-xs">
            {result.failed.map((f) => (
              <li key={f.index}>
                Row {f.index + 1}: {f.error}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
          <Button size="lg" className="h-11 rounded-xl" render={<Link href="/transactions" />}>
            View activity
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-11 rounded-xl"
            onClick={() => {
              setStep("upload");
              setPreview(null);
              setRows([]);
              setResult(null);
              setFileName(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            Import another
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-4">
        <FormError message={error} />

        {preview && preview.skipped.length > 0 ? (
          <details className="rounded-xl bg-loan/15 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">
              {preview.skipped.length} row{preview.skipped.length === 1 ? "" : "s"} couldn&apos;t be read
            </summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
              {preview.skipped.slice(0, 50).map((s, i) => (
                <li key={i}>
                  {s.line > 0 ? `Line ${s.line}: ` : ""}
                  {s.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4">
          <Field id="imp-owner" label="Owner">
            <SegmentedControl<Owner> aria-label="Owner" fullWidth options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))} value={owner} onChange={setOwner} />
          </Field>
          <Field id="imp-mode" label="Payment mode">
            <NativeSelect id="imp-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as PaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const cats = r.direction === "debit" ? expenseCategories : incomeCategories;
            return (
              <div
                key={r.index}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center",
                  !r.include && "opacity-50",
                )}
              >
                <Checkbox checked={r.include} onCheckedChange={(v) => updateRow(r.index, { include: v === true })} aria-label={`Include row ${r.index + 1}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{formatDateOnly(r.date, { withYear: false })}</span>
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{r.description}</span>
                    {r.possibleDuplicate ? (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <AlertTriangle className="size-3" aria-hidden /> possible duplicate
                      </Badge>
                    ) : r.confidence === "unmatched" ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <HelpCircle className="size-3" aria-hidden /> pick a category
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1.5 max-w-xs">
                    <NativeSelect
                      value={r.categoryId}
                      onChange={(e) => updateRow(r.index, { categoryId: e.target.value })}
                      placeholder="Choose category"
                      options={cats.map((c) => ({ value: c.id, label: `${c.icon ? c.icon + " " : ""}${c.name}` }))}
                      aria-invalid={r.include && !r.categoryId}
                    />
                  </div>
                </div>
                <Money value={r.amount} tone={r.direction === "debit" ? "expense" : "income"} signed className="shrink-0 text-right font-semibold" />
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{selected.length} of {rows.length} selected</span>
            <span className="flex gap-3">
              <Money value={totalDebit.toFixed(2)} tone="expense" />
              <Money value={totalCredit.toFixed(2)} tone="income" />
            </span>
          </div>
          <Button size="lg" className="h-12 rounded-xl" disabled={pending || selected.length === 0} onClick={onConfirm}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Add {selected.length} transaction{selected.length === 1 ? "" : "s"}
          </Button>
          <Button variant="outline" size="lg" className="h-11 rounded-xl" disabled={pending} onClick={() => setStep("upload")}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      <FormError message={error} />
      <Field id="imp-account" label="Statement is for" required>
        <NativeSelect
          id="imp-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${accountLabel(a)} · ${a.balance}` }))}
        />
      </Field>
      <Field id="imp-file" label="Statement file" required hint="CSV exported from net banking, or a PDF statement (must be a real, text-based PDF from your bank — not a scanned photo).">
        <label
          htmlFor="imp-file"
          className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-muted/40"
        >
          <Upload className="size-6" aria-hidden />
          {fileName ?? "Tap to choose a .csv or .pdf file"}
        </label>
        <input
          ref={fileRef}
          id="imp-file"
          type="file"
          accept=".csv,text/csv,.pdf,application/pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        This creates expenses and income only. Transfers, loans and trading entries still need to be added
        individually, since a single statement can&apos;t tell us the other side of those. PDF reading is
        best-effort — it skips any line it can&apos;t confidently tell debit from credit on rather than
        guess, so always check the review screen before approving. CSV parses more reliably if your bank
        offers it.
      </p>
      <Button size="lg" className="h-12 rounded-xl" disabled={pending} onClick={onUpload}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        Parse statement
      </Button>
    </div>
  );
}
