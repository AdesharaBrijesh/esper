"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { OWNER_FILTERS, type OwnerFilter } from "@/lib/constants";

/** Reads/writes the `owner` search param (ALL | SELF | BROTHER) and keeps other params. */
export function OwnerFilterTabs({ value, className }: { value: OwnerFilter; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const onChange = (next: OwnerFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "ALL") params.delete("owner");
    else params.set("owner", next);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <SegmentedControl
      aria-label="Owner"
      options={OWNER_FILTERS.map((o) => ({ value: o.value, label: o.label }))}
      value={value}
      onChange={onChange}
      size="sm"
      className={className}
    />
  );
}
