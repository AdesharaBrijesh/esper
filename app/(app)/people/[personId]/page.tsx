import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getPersonLedger, type LedgerEntryDTO } from "@/lib/data/people";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { Money } from "@/components/shared/money";
import { PersonAvatar } from "@/components/people/person-avatar";
import { LedgerEntryButtons } from "@/components/people/ledger-entry-dialog";
import { PersonFormDialog } from "@/components/loans/person-form-dialog";
import { PersonDeleteButton } from "@/components/loans/person-delete-button";
import { isLegacyLoanType, PERSON_BALANCE_SIGN, TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import { relativeDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ personId: string }> }) {
  const user = await requireUser();
  const { personId } = await params;
  const ledger = await getPersonLedger(user.id, personId);
  return { title: ledger?.person.name ?? "Person" };
}

function EntryRow({ e, firstName }: { e: LedgerEntryDTO; firstName: string }) {
  const gave = PERSON_BALANCE_SIGN[e.type] === 1;
  const running = Number(e.runningBalance);
  const account = e.fromAccount?.name ?? e.toAccount?.name;
  const Icon = gave ? ArrowUpRight : ArrowDownLeft;
  return (
    <Link
      href={`/transactions/${e.id}`}
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <span
        aria-hidden
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", gave ? "bg-expense/10 text-expense" : "bg-income/10 text-income")}
      >
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{e.notes || (gave ? "You gave" : "You got")}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[relativeDateLabel(e.transactionDate), account, isLegacyLoanType(e.type) ? TRANSACTION_TYPE_LABELS[e.type] : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <Money value={e.amount} tone={gave ? "expense" : "income"} className="block text-sm font-semibold" />
        <span className="text-[11px] text-muted-foreground tabular">
          {running === 0 ? (
            "settled"
          ) : running < 0 ? (
            <>
              you owe <Money value={Math.abs(running)} tone="muted" />
            </>
          ) : (
            <>
              {firstName} owes <Money value={running} tone="muted" />
            </>
          )}
        </span>
      </span>
    </Link>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const user = await requireUser();
  const { personId } = await params;
  const [ledger, accounts] = await Promise.all([getPersonLedger(user.id, personId), getAccountsWithBalances(user.id)]);
  if (!ledger) notFound();
  const { person, entries } = ledger;
  const balance = Number(ledger.balance);
  const firstName = person.name.trim().split(/\s+/)[0] ?? person.name;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="-mb-1 flex items-center justify-between gap-2">
        <Link href="/people" className="-ml-1 inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          People
        </Link>
        <div className="flex items-center gap-1">
          <PersonFormDialog person={person} triggerVariant="ghost" triggerClassName="h-9 rounded-lg" />
          {ledger.legacyLoanCount === 0 ? (
            <PersonDeleteButton id={person.id} name={person.name} entryCount={entries.length} iconOnly />
          ) : null}
        </div>
      </header>

      <section className="flex flex-col items-center gap-3 rounded-3xl border bg-card px-5 pt-6 pb-5 text-center">
        <PersonAvatar name={person.name} size="lg" />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{person.name}</h1>
          {person.phone || person.notes ? (
            <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 text-xs text-muted-foreground">
              {person.phone ? (
                <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3" aria-hidden />
                  {person.phone}
                </a>
              ) : null}
              {person.notes ? <span>{person.notes}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <p className={cn("text-xs font-medium", balance > 0 ? "text-income" : balance < 0 ? "text-expense" : "text-muted-foreground")}>
            {balance > 0 ? `${firstName} owes you` : balance < 0 ? `You owe ${firstName}` : "All settled up"}
          </p>
          <Money
            value={Math.abs(balance)}
            tone={balance > 0 ? "income" : balance < 0 ? "expense" : "muted"}
            className="text-4xl font-semibold tracking-tight"
          />
          {entries.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              You gave <Money value={ledger.gave} className="font-medium text-foreground" /> · You got{" "}
              <Money value={ledger.got} className="font-medium text-foreground" />
            </p>
          ) : null}
        </div>

        <LedgerEntryButtons person={person} balance={ledger.balance} accounts={accounts} className="w-full max-w-sm" />
      </section>

      <section className="rounded-2xl border bg-card p-2">
        <h2 className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Entries {entries.length > 0 ? <span className="font-normal">· {entries.length}</span> : null}
        </h2>
        {entries.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Tap <span className="font-medium text-expense">You gave</span> or{" "}
            <span className="font-medium text-income">You got</span> to start.
          </p>
        ) : (
          <div className="flex flex-col">
            {entries.map((e) => (
              <EntryRow key={e.id} e={e} firstName={firstName} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
