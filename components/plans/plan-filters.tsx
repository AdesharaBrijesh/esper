"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { PLAN_KIND_ICONS, PLAN_KIND_LABELS, PLAN_KINDS, type OwnerFilter, type PlanKind } from "@/lib/constants";

type KindFilter = PlanKind | "ALL";
type StatusFilter = "ACTIVE" | "COMPLETED" | "CANCELLED" | "ALL";

/** Kind / status / owner filters, all held in the URL so the view is shareable and back works. */
export function PlanFilters({
  kind,
  status,
  owner,
}: {
  kind: KindFilter;
  status: StatusFilter;
  owner: OwnerFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string, clearWhen: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === clearWhen) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl<KindFilter>
        aria-label="Plan type"
        size="sm"
        value={kind}
        onChange={(v) => setParam("kind", v, "ALL")}
        options={[
          { value: "ALL", label: "All" },
          ...PLAN_KINDS.map((k) => ({
            value: k as KindFilter,
            label: `${PLAN_KIND_ICONS[k]} ${PLAN_KIND_LABELS[k]}`,
          })),
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<StatusFilter>
          aria-label="Plan status"
          size="sm"
          value={status}
          onChange={(v) => setParam("status", v, "ACTIVE")}
          options={[
            { value: "ACTIVE", label: "Active" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
            { value: "ALL", label: "All" },
          ]}
        />
        <OwnerFilterTabs value={owner} />
      </div>
    </div>
  );
}
