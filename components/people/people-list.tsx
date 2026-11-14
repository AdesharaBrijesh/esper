"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Money } from "@/components/shared/money";
import { PersonAvatar } from "@/components/people/person-avatar";
import { relativeDateLabel } from "@/lib/dates";
import type { PersonSummaryDTO } from "@/lib/data/people";
import { cn } from "@/lib/utils";

function PersonRow({ p }: { p: PersonSummaryDTO }) {
  const b = Number(p.balance);
  const standing = b > 0 ? "owes you" : b < 0 ? "you owe" : "settled";
  return (
    <Link
      href={`/people/${p.id}`}
      className="press flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60"
    >
      <PersonAvatar name={p.name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{p.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.lastActivity
            ? `${relativeDateLabel(p.lastActivity)} · ${p.entryCount} entr${p.entryCount === 1 ? "y" : "ies"}`
            : "No entries yet"}
        </span>
      </span>
      <span className="text-right">
        {b === 0 ? (
          <span className="block text-sm text-muted-foreground">₹0</span>
        ) : (
          <Money value={Math.abs(b)} tone={b > 0 ? "income" : "expense"} className="block text-sm font-semibold" />
        )}
        <span className={cn("text-[11px]", b > 0 ? "text-income" : b < 0 ? "text-expense" : "text-muted-foreground")}>{standing}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
    </Link>
  );
}

function Group({ title, tone, people }: { title: string; tone: string; people: PersonSummaryDTO[] }) {
  if (people.length === 0) return null;
  return (
    <section className="rounded-2xl border bg-card p-2">
      <h2 className={cn("px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider uppercase", tone)}>
        {title} <span className="font-normal text-muted-foreground">· {people.length}</span>
      </h2>
      <div className="flex flex-col">
        {people.map((p) => (
          <PersonRow key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}

export function PeopleList({ people }: { people: PersonSummaryDTO[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
  }, [people, q]);

  // Biggest amounts first: that is who you want to see.
  const youOwe = filtered.filter((p) => Number(p.balance) < 0).sort((a, b) => Number(a.balance) - Number(b.balance));
  const owesYou = filtered.filter((p) => Number(p.balance) > 0).sort((a, b) => Number(b.balance) - Number(a.balance));
  const settled = filtered.filter((p) => Number(p.balance) === 0);

  return (
    <div className="flex flex-col gap-3">
      {people.length > 6 ? (
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
            className="h-11 w-full rounded-xl border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>
      ) : null}
      <Group title="You owe" tone="text-expense" people={youOwe} />
      <Group title="Owe you" tone="text-income" people={owesYou} />
      <Group title="Settled" tone="text-muted-foreground" people={settled} />
      {filtered.length === 0 && q ? <p className="py-6 text-center text-sm text-muted-foreground">No one called “{q}”.</p> : null}
    </div>
  );
}
