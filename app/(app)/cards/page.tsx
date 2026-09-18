import { requireUser } from "@/lib/auth/dal";
import { cardTotals, getCards } from "@/lib/data/cards";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { CardTile } from "@/components/cards/card-tile";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { formatDateOnly } from "@/lib/dates";
import { parseOwnerFilter } from "@/lib/constants";

export const metadata = { title: "Cards" };

export default async function CardsPage({ searchParams }: PageProps<"/cards">) {
  const user = await requireUser();
  const params = await searchParams;
  const owner = parseOwnerFilter(params.owner);

  const cards = await getCards(user.id, { owner, includeInactive: true });
  const totals = cardTotals(cards.filter((c) => c.isActive));

  const addCard = <AccountFormDialog defaultType="CARD" triggerLabel="Add card" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Cards"
        description="What you owe, how much room is left, and when the bill lands."
        actions={addCard}
      />

      <OwnerFilterTabs value={owner} />

      {cards.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No cards yet"
          description="Add a credit card with its limit and due day. Spending on it is a normal expense; paying the bill is a transfer."
          action={addCard}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total outstanding"
              value={totals.outstanding}
              hint={`${totals.cards} card${totals.cards === 1 ? "" : "s"}`}
              icon="💳"
            />
            <StatCard
              label="Available to spend"
              value={totals.available}
              hint={totals.utilisation !== null ? `${totals.utilisation}% of limit used` : "No limits set"}
              icon="🟢"
            />
          </div>

          {totals.nextDueDate ? (
            <p className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              Next bill due <span className="font-medium text-foreground">{formatDateOnly(totals.nextDueDate, { withYear: true })}</span>
            </p>
          ) : null}

          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {cards.map((card) => (
              <li key={card.id}>
                <CardTile card={card} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
