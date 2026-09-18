import { requireUser } from "@/lib/auth/dal";
import { getPlans, getPlanTotals } from "@/lib/data/plans";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PlanCard } from "@/components/plans/plan-card";
import { PlanFormDialog } from "@/components/plans/plan-form-dialog";
import { PlanFilters } from "@/components/plans/plan-filters";
import { Money } from "@/components/shared/money";
import { PLAN_KIND_ICONS, PLAN_KIND_LABELS, PLAN_KINDS, parseOwnerFilter, type PlanKind } from "@/lib/constants";

export const metadata = { title: "Plans" };

function parseKind(value: string | string[] | undefined): PlanKind | "ALL" {
  const v = Array.isArray(value) ? value[0] : value;
  return PLAN_KINDS.includes(v as PlanKind) ? (v as PlanKind) : "ALL";
}

function parseStatus(value: string | string[] | undefined): "ACTIVE" | "COMPLETED" | "CANCELLED" | "ALL" {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "COMPLETED" || v === "CANCELLED" || v === "ALL" ? v : "ACTIVE";
}

export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  const user = await requireUser();
  const params = await searchParams;
  const kind = parseKind(params.kind);
  const status = parseStatus(params.status);
  const owner = parseOwnerFilter(params.owner);

  const [plans, totals, accounts, categories] = await Promise.all([
    getPlans(user.id, { kind, status, owner }),
    getPlanTotals(user.id, owner),
    getAccountsWithBalances(user.id),
    getCategories(user.id),
  ]);

  // A plan is paid from liquid money; portfolio accounts are funded, not spent from.
  const payFrom = accounts.filter((a) => a.type !== "TRADING" && a.type !== "INVESTMENT");
  const investmentAccounts = accounts.filter((a) => a.type === "INVESTMENT");

  const newPlanButton = (
    <PlanFormDialog
      accounts={payFrom}
      investmentAccounts={investmentAccounts}
      categories={categories}
      triggerLabel="New plan"
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Plans"
        description="Fees, subscriptions, bills, EMIs and SIPs — everything that repeats."
        actions={newPlanButton}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Per month"
          value={totals.monthlyCommitment}
          hint={`${totals.activePlans} active plan${totals.activePlans === 1 ? "" : "s"}`}
          icon="🔁"
        />
        <StatCard
          label="Still to pay"
          value={totals.outstandingAmount}
          hint="Across every active plan"
          icon="📌"
        />

        {totals.overdueCount > 0 || totals.dueSoonCount > 0 ? (
          <div className="col-span-2 flex flex-col gap-2 rounded-2xl border bg-card p-4">
            {totals.overdueCount > 0 ? (
              <p className="text-sm font-medium text-expense">
                {totals.overdueCount} instalment{totals.overdueCount === 1 ? "" : "s"} overdue ·{" "}
                <Money value={totals.overdueAmount} tone="expense" />
              </p>
            ) : null}
            {totals.dueSoonCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {totals.dueSoonCount} due soon · <Money value={totals.dueSoonAmount} className="text-foreground" />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <PlanFilters kind={kind} status={status} owner={owner} />

      {plans.length === 0 ? (
        <EmptyState
          icon={kind === "ALL" ? "🔁" : PLAN_KIND_ICONS[kind as PlanKind]}
          title={kind === "ALL" ? "No plans yet" : `No ${PLAN_KIND_LABELS[kind as PlanKind].toLowerCase()} plans`}
          description="Add your course fees, subscriptions, EMIs or SIPs once and every instalment — past and future — is scheduled for you."
          action={newPlanButton}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
