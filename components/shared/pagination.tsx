"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Prev / Next pagination driven by the `page` search param (keeps other params). */
export function Pagination({
  page,
  pageSize,
  total,
  hasMore,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const btn = "inline-flex h-11 items-center gap-1 rounded-xl border px-4 text-sm font-medium transition-colors hover:bg-muted";
  const disabled = "pointer-events-none opacity-40";

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3", className)}>
      <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={cn(btn, page <= 1 && disabled)} scroll>
        <ChevronLeft className="size-4" aria-hidden /> Prev
      </Link>
      <span className="text-xs text-muted-foreground">
        Page {page} of {pages} · {total} total
      </span>
      <Link href={hrefFor(page + 1)} aria-disabled={!hasMore} className={cn(btn, !hasMore && disabled)} scroll>
        Next <ChevronRight className="size-4" aria-hidden />
      </Link>
    </nav>
  );
}
