"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { DateInput } from "@/components/shared/date-input";
import { filtersToSearchParams, type TransactionFilters as Filters } from "@/lib/validations/filters";
import {
  OWNER_LABELS,
  OWNERS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  TRANSACTION_GROUPS,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/constants";
import { formatDateOnly, presetRange, type RangePreset } from "@/lib/dates";
import type { AccountDTO, CategoryDTO, PersonDTO } from "@/lib/types";

type Draft = Omit<Filters, "page">;

const RANGE_OPTIONS: { value: RangePreset | "all"; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function detectPreset(f: Draft): RangePreset | "all" {
  if (!f.from && !f.to) return "all";
  for (const p of ["this-month", "last-month", "last-3-months", "this-year"] as const) {
    const r = presetRange(p);
    if (r.from === f.from && r.to === f.to) return p;
  }
  return "custom";
}

export function TransactionFilters({
  filters,
  accounts,
  categories,
  people,
}: {
  filters: Filters;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  people: PersonDTO[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const { page: _page, ...current } = filters;
  void _page;
  const [draft, setDraft] = useState<Draft>(current);
  const [q, setQ] = useState(current.q ?? "");

  const apply = (next: Draft) => {
    const qs = filtersToSearchParams(next).toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((q || undefined) !== (current.q || undefined)) apply({ ...current, q: q || undefined });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Explicit preset state so "Custom range" stays selected while the dates still match a preset.
  const [preset, setPresetState] = useState<RangePreset | "all">(() => detectPreset(current));
  const setPreset = (value: RangePreset | "all") => {
    setPresetState(value);
    if (value === "all") setDraft({ ...draft, from: undefined, to: undefined });
    else if (value === "custom") setDraft({ ...draft, from: draft.from ?? presetRange("this-month").from, to: draft.to ?? presetRange("this-month").to });
    else setDraft({ ...draft, ...presetRange(value) });
  };

  const group = TRANSACTION_GROUPS.find((g) => g.value === draft.group);

  const chips = useMemo(() => {
    const out: { key: keyof Draft | "range"; label: string }[] = [];
    if (current.from || current.to) {
      const p = detectPreset(current);
      const label =
        p !== "all" && p !== "custom"
          ? RANGE_OPTIONS.find((r) => r.value === p)!.label
          : `${current.from ? formatDateOnly(current.from) : "…"} – ${current.to ? formatDateOnly(current.to) : "…"}`;
      out.push({ key: "range", label });
    }
    if (current.type) out.push({ key: "type", label: TRANSACTION_TYPE_LABELS[current.type] });
    else if (current.group) out.push({ key: "group", label: TRANSACTION_GROUPS.find((g) => g.value === current.group)?.label ?? current.group });
    if (current.categoryId) out.push({ key: "categoryId", label: categories.find((c) => c.id === current.categoryId)?.name ?? "Category" });
    if (current.accountId) out.push({ key: "accountId", label: accounts.find((a) => a.id === current.accountId)?.name ?? "Account" });
    if (current.owner) out.push({ key: "owner", label: `Owner: ${OWNER_LABELS[current.owner]}` });
    if (current.paymentMode) out.push({ key: "paymentMode", label: PAYMENT_MODE_LABELS[current.paymentMode] });
    if (current.personId) out.push({ key: "personId", label: people.find((p) => p.id === current.personId)?.name ?? "Person" });
    if (current.loanId) out.push({ key: "loanId", label: "Specific loan" });
    return out;
  }, [current, categories, accounts, people]);

  const removeChip = (key: keyof Draft | "range") => {
    const next: Draft = { ...current };
    if (key === "range") {
      delete next.from;
      delete next.to;
    } else if (key === "group") {
      delete next.group;
      delete next.type;
    } else {
      delete next[key];
    }
    setDraft(next);
    apply(next);
  };

  const accountGroups = OWNERS.map((o) => ({
    label: OWNER_LABELS[o],
    options: accounts.filter((a) => a.owner === o).map((a) => ({ value: a.id, label: a.isActive ? a.name : `${a.name} (archived)` })),
  })).filter((g) => g.options.length > 0);
  const categoryGroups = (["EXPENSE", "INCOME"] as const)
    .map((t) => ({
      label: t === "EXPENSE" ? "Expense" : "Income",
      options: categories.filter((c) => c.type === t).map((c) => ({ value: c.id, label: `${c.icon ? c.icon + " " : ""}${c.name}${c.isActive ? "" : " (disabled)"}` })),
    }))
    .filter((g) => g.options.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="h-11 rounded-xl pl-9"
          />
        </div>
        <Button
          variant={chips.length ? "default" : "outline"}
          size="lg"
          className="h-11 rounded-xl"
          onClick={() => {
            setDraft(current);
            setPresetState(detectPreset(current));
            setOpen(true);
          }}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters{chips.length ? ` (${chips.length})` : ""}
        </Button>
      </div>

      {chips.length > 0 ? (
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => removeChip(c.key)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium text-accent-foreground"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setDraft({});
              setQ("");
              apply({});
            }}
            className="h-8 shrink-0 px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto rounded-t-3xl p-5 pb-safe md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-96 md:rounded-none">
          <SheetHeader className="p-0">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Narrow down your activity.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4">
            <Field id="f-range" label="Date range">
              <NativeSelect id="f-range" value={preset} onChange={(e) => setPreset(e.target.value as RangePreset | "all")} options={RANGE_OPTIONS} />
            </Field>
            {preset === "custom" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field id="f-from" label="From">
                  <DateInput id="f-from" value={draft.from ?? ""} onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })} />
                </Field>
                <Field id="f-to" label="To">
                  <DateInput id="f-to" value={draft.to ?? ""} onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })} />
                </Field>
              </div>
            ) : null}
            <Field id="f-group" label="Kind">
              <NativeSelect
                id="f-group"
                value={draft.group ?? ""}
                onChange={(e) => setDraft({ ...draft, group: (e.target.value || undefined) as Draft["group"], type: undefined })}
                placeholder="All kinds"
                options={TRANSACTION_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
              />
            </Field>
            {group && group.types.length > 1 ? (
              <Field id="f-type" label="Type">
                <NativeSelect
                  id="f-type"
                  value={draft.type ?? ""}
                  onChange={(e) => setDraft({ ...draft, type: (e.target.value || undefined) as Draft["type"] })}
                  placeholder={`All ${group.label.toLowerCase()} types`}
                  options={group.types.map((t) => ({ value: t, label: TRANSACTION_TYPE_LABELS[t] }))}
                />
              </Field>
            ) : null}
            <Field id="f-category" label="Category">
              <NativeSelect
                id="f-category"
                value={draft.categoryId ?? ""}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || undefined })}
                placeholder="Any category"
                groups={categoryGroups}
              />
            </Field>
            <Field id="f-account" label="Account">
              <NativeSelect
                id="f-account"
                value={draft.accountId ?? ""}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value || undefined })}
                placeholder="Any account"
                groups={accountGroups}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field id="f-owner" label="Owner">
                <NativeSelect
                  id="f-owner"
                  value={draft.owner ?? ""}
                  onChange={(e) => setDraft({ ...draft, owner: (e.target.value || undefined) as Draft["owner"] })}
                  placeholder="All"
                  options={OWNERS.map((o) => ({ value: o, label: OWNER_LABELS[o] }))}
                />
              </Field>
              <Field id="f-mode" label="Payment mode">
                <NativeSelect
                  id="f-mode"
                  value={draft.paymentMode ?? ""}
                  onChange={(e) => setDraft({ ...draft, paymentMode: (e.target.value || undefined) as Draft["paymentMode"] })}
                  placeholder="Any"
                  options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
                />
              </Field>
            </div>
            {people.length > 0 ? (
              <Field id="f-person" label="Person (loans)">
                <NativeSelect
                  id="f-person"
                  value={draft.personId ?? ""}
                  onChange={(e) => setDraft({ ...draft, personId: e.target.value || undefined })}
                  placeholder="Anyone"
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            ) : null}
          </div>
          <SheetFooter className="flex-row gap-2 p-0">
            <Button
              variant="outline"
              size="lg"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setDraft({});
                setQ("");
                apply({});
                setOpen(false);
              }}
            >
              Reset
            </Button>
            <Button
              size="lg"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                apply({ ...draft, q: q || undefined });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
