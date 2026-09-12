import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getPlanById } from "@/lib/data/plans";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Money } from "@/components/shared/money";
import { Progress } from "@/components/ui/progress";
import { InstallmentList } from "@/components/plans/installment-list";
import { PlanFormDialog } from "@/components/plans/plan-form-dialog";
import { PlanActions } from "@/components/plans/plan-actions";
import { formatDateOnly } from "@/lib/dates";
import {
  OWNER_LABELS,
  PAYMENT_MODE_LABELS,
  PLAN_FREQUENCY_LABELS,
  PLAN_KIND_ICONS,
  PLAN_KIND_LABELS,
  PLAN_STATUS_LABELS,
} from "@/lib/constants";

export async function generateMetadata({ params }: PageProps<"/plans/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const detail = await getPlanById(user.id, id);
  return { title: detail?.plan.name ?? "Plan" };
}

export default async function PlanDetailPage({ params }: PageProps<"/plans/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const [detail, accounts, categories] = await Promise.all([
    getPlanById(user.id, id),
    getAccountsWithBalances(user.id),
    getCategories(user.id),
  ]);
  if (!detail) notFound();

  const { plan, installments } = detail;
  const payFrom = accounts.filter((a) => a.type !== "TRADING" && a.type !== "INVESTMENT");
  const investmentAccounts = accounts.filter((a) => a.type === "INVESTMENT");

  const meta = [
    PLAN_KIND_LABELS[plan.kind],
    PLAN_FREQUENCY_LABELS[plan.frequency],
    OWNER_LABELS[plan.owner],
    plan.status !== "ACTIVE" ? PLAN_STATUS_LABELS[plan.status] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        backHref="/plans"
        backLabel="Plans"
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden>{plan.category?.icon ?? PLAN_KIND_ICONS[plan.kind]}</span>
            <span className="min-w-0 truncate">{plan.name}</span>
          </span>
        }
        description={plan.provider ? `${plan.provider} · ${meta}` : meta}
        actions={
          <PlanFormDialog
            plan={plan}
            accounts={payFrom}
            investmentAccounts={investmentAccounts}
            categories={categories}
            triggerLabel="Edit"
            triggerVariant="outline"
            triggerIcon="pencil"
          />
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Paid so far" value={plan.progress.paidAmount} hint={`${plan.progress.paid} instalments`} tone="income" />
        <StatCard
          label="Still to pay"
          value={plan.progress.remainingAmount}
          hint={`${plan.progress.pending} instalments`}
          tone={plan.progress.overdue > 0 ? "expense" : "neutral"}
        />
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progress</span>
          <span className="text-muted-foreground">{plan.progress.percentPaid}%</span>
        </div>
        <Progress value={plan.progress.percentPaid} className="h-2" />
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Total <Money value={plan.progress.totalAmount} className="text-foreground" />
          </span>
          <span>
            Each <Money value={plan.amount} className="text-foreground" />
          </span>
          <span>Starts {formatDateOnly(plan.startDate, { withYear: true })}</span>
          {plan.endDate ? <span>Ends {formatDateOnly(plan.endDate, { withYear: true })}</span> : null}
          {plan.progress.skipped > 0 ? <span>{plan.progress.skipped} skipped</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {plan.fromAccount ? <span>Paid from {plan.fromAccount.name}</span> : null}
          {plan.toAccount ? <span>Invests into {plan.toAccount.name}</span> : null}
          {plan.category ? <span>Category {plan.category.name}</span> : null}
          <span>{PAYMENT_MODE_LABELS[plan.paymentMode]}</span>
        </div>
        {plan.notes ? <p className="mt-2 text-sm text-muted-foreground">{plan.notes}</p> : null}
      </section>

      <InstallmentList plan={plan} installments={installments} accounts={payFrom} />

      <PlanActions plan={plan} />
    </div>
  );
}
