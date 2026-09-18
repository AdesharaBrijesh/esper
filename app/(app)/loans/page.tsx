import Link from "next/link";
import { ChevronRight, HandCoins, Handshake } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getLoanOverview, type PersonLoanSummaryDTO } from "@/lib/data/loans";
import { getPeople } from "@/lib/data/people";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PersonFormDialog } from "@/components/loans/person-form-dialog";
import { PersonDeleteButton } from "@/components/loans/person-delete-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "People & Loans" };

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-loan/20 text-sm font-semibold text-foreground", className)} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

function PersonRow({ p, tone }: { p: PersonLoanSummaryDTO; tone: "expense" | "income" }) {
  const amount = tone === "expense" ? p.youOwe : p.owedToYou;
  return (
    <Link href={`/loans/${p.personId}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60 active:bg-muted">
      <Avatar name={p.personName} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{p.personName}</span>
        <span className="block text-xs text-muted-foreground">
          {p.activeLoans} active loan{p.activeLoans === 1 ? "" : "s"}
        </span>
      </span>
      <span className="text-right">
        <Money value={amount} tone={tone} className="block font-semibold" />
        <span className="text-[11px] text-muted-foreground">remaining</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export default async function LoansPage() {
  const user = await requireUser();
  const [overview, people] = await Promise.all([getLoanOverview(user.id), getPeople(user.id)]);
  const activeIds = new Set([...overview.youOwePeople, ...overview.owedToYouPeople].map((p) => p.personId));
  const settledPeople = people.filter((p) => !activeIds.has(p.id));
  const loanCountByPerson = new Map<string, number>();
  for (const l of overview.activeLoans) loanCountByPerson.set(l.personId, (loanCountByPerson.get(l.personId) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="People & Loans"
        description="Money borrowed or lent is never income or expense"
        actions={<PersonFormDialog />}
      />

      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <StatCard label="You owe" value={overview.youOwe} tone="expense" compact />
        <StatCard label="Owed to you" value={overview.owedToYou} tone="income" compact />
        <StatCard label="Net" value={overview.net} tone="auto" compact hint={Number(overview.net) >= 0 ? "in your favour" : "you owe more"} />
      </div>

      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 lg:max-w-md">
        <Button size="lg" className="h-12 rounded-xl bg-expense/10 text-expense hover:bg-expense/20" variant="secondary" render={<Link href="/transactions/new?type=BORROW&returnTo=/loans" />}>
          <HandCoins className="size-4" aria-hidden />
          Borrow money
        </Button>
        <Button size="lg" className="h-12 rounded-xl bg-income/10 text-income hover:bg-income/20" variant="secondary" render={<Link href="/transactions/new?type=LEND&returnTo=/loans" />}>
          <Handshake className="size-4" aria-hidden />
          Lend money
        </Button>
      </nav>

      {overview.youOwePeople.length === 0 && overview.owedToYouPeople.length === 0 && people.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="No loans yet"
          description="Record money you borrow from friends or lend to them. Repayments update the outstanding balance automatically."
        />
      ) : null}

      {overview.youOwePeople.length > 0 ? (
        <section className="rounded-2xl border bg-card p-3">
          <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-expense uppercase">You owe</h2>
          <div className="flex flex-col">
            {overview.youOwePeople.map((p) => (
              <PersonRow key={p.personId} p={p} tone="expense" />
            ))}
          </div>
        </section>
      ) : null}

      {overview.owedToYouPeople.length > 0 ? (
        <section className="rounded-2xl border bg-card p-3">
          <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-income uppercase">Owed to you</h2>
          <div className="flex flex-col">
            {overview.owedToYouPeople.map((p) => (
              <PersonRow key={p.personId} p={p} tone="income" />
            ))}
          </div>
        </section>
      ) : null}

      {settledPeople.length > 0 ? (
        <section className="rounded-2xl border bg-card p-3">
          <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Everyone else</h2>
          <ul className="flex flex-col">
            {settledPeople.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={p.name} className="bg-muted" />
                <Link href={`/loans/${p.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.phone ?? "Settled · no active loans"}</span>
                </Link>
                <PersonDeleteButton id={p.id} name={p.name} iconOnly />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
