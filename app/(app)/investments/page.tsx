import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getInvestments, investmentTotals } from "@/lib/data/investments";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { Button } from "@/components/ui/button";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ValuationDialog } from "@/components/investments/valuation-dialog";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { formatDateOnly } from "@/lib/dates";
import { OWNER_LABELS, parseOwnerFilter } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata = { title: "Investments" };

export default async function InvestmentsPage({ searchParams }: PageProps<"/investments">) {
  const user = await requireUser();
  const params = await searchParams;
  const owner = parseOwnerFilter(params.owner);

  const investments = await getInvestments(user.id, { owner, includeInactive: true });
  const active = investments.filter((i) => i.isActive);
  const totals = investmentTotals(active);

  const addAccount = <AccountFormDialog defaultType="INVESTMENT" triggerLabel="Add holding" />;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Investments"
        description="What you put in, what it is worth now, and the difference."
        actions={
          investments.length > 0 ? (
            <ValuationDialog investments={active} triggerLabel="Update value" />
          ) : (
            addAccount
          )
        }
      />

      <OwnerFilterTabs value={owner} />

      {investments.length === 0 ? (
        <EmptyState
          icon="📊"
          title="No holdings yet"
          description="Add an investment account, fund it with a transfer, then record what it is worth whenever you check. No price feeds, no API keys."
          action={addAccount}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Invested" value={totals.invested} hint={`${totals.accounts} holdings`} icon="📥" />
            <StatCard
              label="Current value"
              value={totals.currentValue}
              hint={totals.partiallyValued ? "Some holdings valued at cost" : "All holdings valued"}
              icon="📊"
            />

            <div className="col-span-2 rounded-2xl border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Total gain</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <Money
                  value={totals.gain}
                  signed
                  tone={Number(totals.gain) >= 0 ? "income" : "expense"}
                  className="text-2xl font-semibold"
                />
                {totals.returnPercent !== null ? (
                  <span
                    className={cn(
                      "text-sm font-medium",
                      totals.returnPercent >= 0 ? "text-income" : "text-expense",
                    )}
                  >
                    {totals.returnPercent >= 0 ? "+" : ""}
                    {totals.returnPercent}%
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {active.map((investment) => (
              <li key={investment.id}>
                <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{investment.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[investment.institution, OWNER_LABELS[investment.owner]].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={investment.currentValue} className="font-semibold" />
                      <p className="text-[11px] text-muted-foreground">
                        {investment.hasValuation && investment.valuedOn
                          ? `on ${formatDateOnly(investment.valuedOn)}`
                          : "at cost"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Invested <Money value={investment.invested} className="text-foreground" />
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        Number(investment.gain) >= 0 ? "text-income" : "text-expense",
                      )}
                    >
                      <Money
                        value={investment.gain}
                        signed
                        tone={Number(investment.gain) >= 0 ? "income" : "expense"}
                      />
                      {investment.returnPercent !== null
                        ? ` (${investment.returnPercent >= 0 ? "+" : ""}${investment.returnPercent}%)`
                        : ""}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <ValuationDialog
                      investments={active}
                      presetAccountId={investment.id}
                      triggerLabel="Update value"
                      triggerVariant="outline"
                      triggerClassName="h-9 flex-1 rounded-xl text-xs"
                    />
                    <Button
                      variant="outline"
                      size="lg"
                      className="h-9 flex-1 rounded-xl text-xs"
                      render={
                        <Link
                          href={`/transactions/new?type=TRANSFER&toAccountId=${investment.id}&returnTo=/investments`}
                        />
                      }
                    >
                      Invest more
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          <div className="flex justify-center">{addAccount}</div>
        </>
      )}
    </div>
  );
}
