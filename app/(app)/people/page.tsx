import { requireUser } from "@/lib/auth/dal";
import { getPeopleLedger } from "@/lib/data/people";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { PersonFormDialog } from "@/components/loans/person-form-dialog";
import { PeopleList } from "@/components/people/people-list";

export const metadata = { title: "People" };

function peopleCount(n: number) {
  return n === 1 ? "1 person" : `${n} people`;
}

export default async function PeoplePage() {
  const user = await requireUser();
  const ledger = await getPeopleLedger(user.id);
  const net = Number(ledger.net);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader
        title="People"
        description="What you owe friends, and what they owe you"
        actions={<PersonFormDialog triggerVariant="default" />}
      />

      {ledger.people.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="Nobody here yet"
          description="Add a friend, then note every time you give them money or they give you some. Esper keeps the running total."
          action={<PersonFormDialog triggerVariant="default" triggerLabel="Add your first person" />}
        />
      ) : (
        <>
          <section className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-col gap-1 p-4">
              <p className="text-xs font-medium text-muted-foreground">You need to pay</p>
              <Money value={ledger.toPay} tone={Number(ledger.toPay) > 0 ? "expense" : "muted"} className="text-2xl font-semibold tracking-tight" />
              <p className="text-xs text-muted-foreground">
                {ledger.peopleToPay > 0 ? `to ${peopleCount(ledger.peopleToPay)}` : "You owe no one"}
              </p>
            </div>
            <div className="flex flex-col gap-1 border-l p-4">
              <p className="text-xs font-medium text-muted-foreground">You&apos;ll get back</p>
              <Money value={ledger.toReceive} tone={Number(ledger.toReceive) > 0 ? "income" : "muted"} className="text-2xl font-semibold tracking-tight" />
              <p className="text-xs text-muted-foreground">
                {ledger.peopleToReceive > 0 ? `from ${peopleCount(ledger.peopleToReceive)}` : "No one owes you"}
              </p>
            </div>
            {net !== 0 ? (
              <p className="col-span-2 border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                Overall, {net > 0 ? "you're up" : "you're down"}{" "}
                <Money value={Math.abs(net)} tone={net > 0 ? "income" : "expense"} className="font-semibold" />
              </p>
            ) : null}
          </section>

          <PeopleList people={ledger.people} />
        </>
      )}
    </div>
  );
}
