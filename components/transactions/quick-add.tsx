"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CornerDownLeft, Loader2, TriangleAlert } from "lucide-react";
import { quickAddExpensesAction } from "@/lib/actions/quick-add";
import { buildAccountAliases, parseQuickText, type QuickLine } from "@/lib/calculations/quick-add";
import { suggestCategory, type LearnedHints } from "@/lib/calculations/categorize";
import { ACCOUNT_TYPE_PAYMENT_MODE, isPortfolioAccount, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/constants";
import { addDays, formatDateOnly, todayDateOnly } from "@/lib/dates";
import { formatINR, sum } from "@/lib/money";
import type { AccountDTO, CategoryDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "@/components/shared/chip-select";
import { EmptyState } from "@/components/shared/empty-state";
import { useLocalStorage } from "@/lib/client/use-local-storage";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "esper:quick-add:draft";
const CASH_KEY = "esper:quick-add:cash";
const ONLINE_KEY = "esper:quick-add:online";

/** Day-to-day spends from a bank account go out over UPI, not as a bank transfer. */
function modeFor(account: AccountDTO): PaymentMode {
  return account.type === "BANK" ? "UPI" : ACCOUNT_TYPE_PAYMENT_MODE[account.type];
}

function defaultCash(accounts: AccountDTO[]): AccountDTO | undefined {
  return accounts.find((a) => a.type === "CASH" && a.owner === "SELF") ?? accounts.find((a) => a.type === "CASH") ?? accounts[0];
}
function defaultOnline(accounts: AccountDTO[]): AccountDTO | undefined {
  const bob = (a: AccountDTO) => /\b(bob|baroda)\b/i.test(`${a.name} ${a.institution ?? ""}`);
  return (
    accounts.find((a) => bob(a) && a.owner === "SELF") ??
    accounts.find(bob) ??
    accounts.find((a) => a.type === "BANK" && a.owner === "SELF") ??
    accounts.find((a) => a.type === "UPI" && a.owner === "SELF") ??
    accounts.find((a) => a.type === "BANK" || a.type === "UPI")
  );
}

interface ResolvedRow {
  key: string;
  line: QuickLine;
  accountId: string;
  account: AccountDTO | undefined;
  paymentMode: PaymentMode;
  categoryId: string;
  category: CategoryDTO | undefined;
  /** True when the category is the fallback rather than a real match. */
  guessed: boolean;
}

export function QuickAdd({
  accounts: allAccounts,
  categories,
  learned,
}: {
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  learned: LearnedHints;
}) {
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  // The draft survives navigating away mid-list.
  const [draft, setDraft] = useLocalStorage(DRAFT_KEY);
  const text = draft ?? "";
  const setText = setDraft;
  const [date, setDate] = useState(todayDateOnly());
  const [overrides, setOverrides] = useState<Record<string, { categoryId?: string; accountId?: string }>>({});
  const [failures, setFailures] = useState<Record<string, string>>({});

  const accounts = useMemo(() => allAccounts.filter((a) => a.isActive && !isPortfolioAccount(a.type)), [allAccounts]);
  const expenseCategories = useMemo(() => categories.filter((c) => c.isActive && c.type === "EXPENSE"), [categories]);
  const aliases = useMemo(() => buildAccountAliases(accounts), [accounts]);
  const [storedCash, setStoredCash] = useLocalStorage(CASH_KEY);
  const [storedOnline, setStoredOnline] = useLocalStorage(ONLINE_KEY);
  const cashId = accounts.some((a) => a.id === storedCash) ? storedCash! : (defaultCash(accounts)?.id ?? "");
  const onlineId = accounts.some((a) => a.id === storedOnline) ? storedOnline! : (defaultOnline(accounts)?.id ?? "");

  // Grow with the content so every line stays visible while typing.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 132)}px`;
  }, [text]);

  const rows = useMemo<ResolvedRow[]>(() => {
    return parseQuickText(text, aliases).map((line) => {
      const key = `${line.index}:${line.raw}`;
      const o = overrides[key] ?? {};
      const autoAccountId =
        line.account.kind === "account" ? line.account.accountId : line.account.kind === "online" ? onlineId : cashId;
      const accountId = o.accountId ?? autoAccountId;
      const account = accounts.find((a) => a.id === accountId);
      const paymentMode: PaymentMode =
        !o.accountId && line.account.kind === "online" ? "UPI" : account ? modeFor(account) : "CASH";
      const suggestion = suggestCategory(line.description, true, categories, learned);
      const categoryId = o.categoryId ?? suggestion.categoryId ?? "";
      return {
        key,
        line,
        accountId,
        account,
        paymentMode,
        categoryId,
        category: expenseCategories.find((c) => c.id === categoryId),
        guessed: !o.categoryId && suggestion.confidence !== "matched",
      };
    });
  }, [text, aliases, overrides, onlineId, cashId, accounts, categories, learned, expenseCategories]);

  const valid = rows.filter((r) => !r.line.error);
  const ready = valid.filter((r) => r.categoryId && r.accountId);
  const blocked = valid.length - ready.length;
  const total = sum(ready.map((r) => r.line.amount!));

  const setOverride = (key: string, patch: { categoryId?: string; accountId?: string }) =>
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const submit = () => {
    if (pending || ready.length === 0 || blocked > 0) return;
    const batch = ready;
    startTransition(async () => {
      const res = await quickAddExpensesAction({
        date,
        entries: batch.map((r) => ({
          amount: r.line.amount!,
          description: r.line.description,
          categoryId: r.categoryId,
          accountId: r.accountId,
          paymentMode: r.paymentMode,
        })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const failedKeys = new Set(res.data.failed.map((f) => batch[f.index].key));
      // Keep anything that was not saved (failed, or had no amount) so nothing is lost.
      const keep = rows.filter((r) => r.line.error || failedKeys.has(r.key)).map((r) => r.line.raw);
      setFailures(Object.fromEntries(res.data.failed.map((f) => [batch[f.index].line.raw, f.error])));
      setText(keep.join("\n"));
      setOverrides({});
      if (res.data.created > 0) {
        const savedTotal = sum(batch.filter((r) => !failedKeys.has(r.key)).map((r) => r.line.amount!));
        toast.success(`Added ${res.data.created} expense${res.data.created === 1 ? "" : "s"} · ${formatINR(savedTotal)}`, {
          action: { label: "View", onClick: () => router.push("/transactions") },
        });
      }
      if (res.data.failed.length > 0) toast.error(`${res.data.failed.length} couldn't be saved. They're still in the box.`);
      router.refresh();
      textRef.current?.focus();
    });
  };

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="🏦"
        title="No account to spend from"
        description="Quick add needs at least a cash or bank account."
        action={
          <Button size="lg" className="h-11 rounded-xl" render={<Link href="/accounts" />}>
            Go to accounts
          </Button>
        }
      />
    );
  }

  const today = todayDateOnly();
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));
  const categoryOptions = expenseCategories.map((c) => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ""}${c.name}` }));
  const cash = accounts.find((a) => a.id === cashId);
  const online = accounts.find((a) => a.id === onlineId);

  return (
    <div className="flex flex-col gap-4">
      {/* Date */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { label: "Today", value: today },
          { label: "Yesterday", value: addDays(today, -1) },
        ].map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setDate(c.value)}
            className={cn(
              "press h-8 rounded-lg border px-3 text-xs font-medium",
              date === c.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
        <label
          className={cn(
            "relative inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium focus-within:ring-3 focus-within:ring-ring/50",
            date !== today && date !== addDays(today, -1) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          {date !== today && date !== addDays(today, -1) ? formatDateOnly(date) : "Pick date"}
          <input
            type="date"
            aria-label="Date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      {/* Input */}
      <div className="overflow-hidden rounded-2xl border bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <textarea
          ref={textRef}
          value={text}
          autoFocus
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          aria-label="Expenses, one per line"
          placeholder={"50 burger\n30 auto\n45 bus online\n120 groceries bob"}
          onChange={(e) => {
            setText(e.target.value);
            if (Object.keys(failures).length) setFailures({});
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className="tabular block w-full resize-none bg-transparent px-4 py-3.5 text-base leading-7 outline-none placeholder:text-muted-foreground/45"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            Default
            <ChipSelect label={cash?.name ?? "Choose"} value={cashId} ariaLabel="Default account" options={accountOptions} onChange={setStoredCash} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px] text-foreground">bob</code>
            <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px] text-foreground">online</code>
            <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px] text-foreground">upi</code>
            →
            <ChipSelect label={online?.name ?? "Choose"} value={onlineId} ariaLabel="Online account" options={accountOptions} onChange={setStoredOnline} />
          </span>
        </div>
      </div>

      {/* Preview */}
      {rows.length > 0 ? (
        <section aria-label="Preview" className="rounded-2xl border bg-card">
          <ul className="divide-y">
            {rows.map((r) =>
              r.line.error ? (
                <li key={r.key} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
                    <TriangleAlert className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate text-muted-foreground">“{r.line.raw}”</p>
                    <p className="text-xs text-muted-foreground/80">No amount. Start the line with one, like “50 {r.line.description || "tea"}”. Skipped.</p>
                  </div>
                </li>
              ) : (
                <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-base"
                    style={r.category?.color ? { backgroundColor: `${r.category.color}1f` } : undefined}
                    aria-hidden
                  >
                    {r.category?.icon ?? "📦"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium first-letter:uppercase", !r.line.description && "text-muted-foreground")}>
                      {r.line.description || "No description"}
                    </p>
                    <div className="mt-1 flex min-w-0 gap-1.5">
                      <ChipSelect
                        label={r.category ? r.category.name : "Category"}
                        className="shrink-0"
                        dotColor={r.category?.color}
                        value={r.categoryId}
                        tone={r.categoryId ? "default" : "warn"}
                        ariaLabel={`Category for ${r.line.description || r.line.raw}`}
                        options={categoryOptions}
                        onChange={(v) => setOverride(r.key, { categoryId: v })}
                      />
                      <ChipSelect
                        label={r.account ? `${PAYMENT_MODE_LABELS[r.paymentMode]} · ${r.account.name}` : "Account"}
                        className="min-w-0"
                        value={r.accountId}
                        tone={r.accountId ? "default" : "warn"}
                        ariaLabel={`Account for ${r.line.description || r.line.raw}`}
                        options={accountOptions}
                        onChange={(v) => setOverride(r.key, { accountId: v })}
                      />
                    </div>
                    {failures[r.line.raw] ? <p className="mt-1 text-xs text-destructive">{failures[r.line.raw]}</p> : null}
                  </div>
                  <span className="tabular shrink-0 text-sm font-semibold text-expense">−{formatINR(r.line.amount!)}</span>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : (
        <p className="px-1 text-sm leading-relaxed text-muted-foreground">
          One expense per line: amount, then what it was. Esper picks the category from the words, and pays from{" "}
          <span className="font-medium text-foreground">{cash?.name ?? "cash"}</span> unless you write{" "}
          <span className="font-medium text-foreground">bob</span>, <span className="font-medium text-foreground">online</span> or{" "}
          <span className="font-medium text-foreground">upi</span>.
        </p>
      )}

      {/* Submit */}
      <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-2xl border bg-background/95 p-2 pl-4 shadow-lg backdrop-blur md:bottom-4">
        <div className="min-w-0 flex-1">
          <p className="tabular text-base font-semibold">{formatINR(total)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {blocked > 0
              ? `${blocked} need${blocked === 1 ? "s" : ""} a category or account`
              : `${ready.length} expense${ready.length === 1 ? "" : "s"} · ${date === today ? "today" : formatDateOnly(date)}`}
          </p>
        </div>
        <Button size="lg" className="h-12 rounded-xl px-5" disabled={pending || ready.length === 0 || blocked > 0} onClick={submit}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {ready.length > 1 ? `Add ${ready.length}` : "Add"}
          <kbd className="ml-1 hidden items-center gap-0.5 rounded border border-primary-foreground/30 px-1 text-[10px] font-normal opacity-80 md:inline-flex">
            Ctrl <CornerDownLeft className="size-2.5" aria-hidden />
          </kbd>
        </Button>
      </div>
    </div>
  );
}
