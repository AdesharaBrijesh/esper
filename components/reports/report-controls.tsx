"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { DateInput } from "@/components/shared/date-input";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { formatDateOnly, presetRange, RANGE_PRESETS, type DateRange, type RangePreset } from "@/lib/dates";
import type { OwnerFilter } from "@/lib/constants";

export function ReportControls({ preset, range, owner }: { preset: RangePreset; range: DateRange; owner: OwnerFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const update = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<RangePreset>
          aria-label="Date range"
          size="sm"
          options={RANGE_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          value={preset}
          onChange={(p) => {
            if (p === "custom") {
              const r = presetRange("this-month");
              update({ preset: "custom", from: range.from ?? r.from, to: range.to ?? r.to });
            } else update({ preset: p, from: undefined, to: undefined });
          }}
        />
        <OwnerFilterTabs value={owner} />
      </div>
      {preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <DateInput aria-label="From date" value={range.from} max={range.to} onChange={(e) => e.target.value && update({ from: e.target.value })} />
          <DateInput aria-label="To date" value={range.to} min={range.from} onChange={(e) => e.target.value && update({ to: e.target.value })} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {formatDateOnly(range.from)} – {formatDateOnly(range.to)}
      </p>
    </div>
  );
}
