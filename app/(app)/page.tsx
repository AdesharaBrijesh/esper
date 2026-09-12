import Link from "next/link";
import { ChevronRight, Landmark } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getDashboardData } from "@/lib/data/dashboard";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { parseOwnerFilter } from "@/lib/constants";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionList } from "@/components/shared/transaction-row";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { UpcomingDues } from "@/components/dashboard/upcoming-dues";
import { SpendingDonut } from "@/components/charts/spending-donut";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, OWNER_LABELS } from "@/lib/constants";
import { formatDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Home" };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const owner = parseOwnerFilter(sp.owner);
  const data = await getDashboardData(user.id, owner);
  const activeAccounts = data.accounts.filter((a) => a.isActive);
  const monthLabel = `${formatDateOnly(data.month.range.from, { withYear: false })} – ${formatDateOnly(data.month.range.to, { withYear: false })}`;
  const noAccounts = activeAccounts.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
        </div>
        <OwnerFilterTabs value={owner} />
      </header>

      {noAccounts ? (
        <EmptyState
          icon={<Landmark className="size-6" />}
          title={owner === "ALL" ? "Set up your accounts" : `No ${OWNER_LABELS[owner]} accounts yet`}
          description="Add your cash, bank, UPI and trading accounts with their current balances. Everything else builds on them."
          action={
            <Button size="lg" className="h-11 rounded-xl" render={<Link href="/accounts" />}>
              Add accounts
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-5 md:grid-cols-5">
        <div className="flex flex-col gap-5 md:col-span-3">
          {/* Net worth */}
          <section className="rounded-3xl bg-primary p-5 text-primary-foreground shadow-md shadow-primary/20">
            <p className="text-sm/5 opacity-85">Total net worth · {owner === "ALL" ? "All" : OWNER_LABELS[owner]}</p>
            <Money value={data.netWorth} className="mt-1 block text-4xl font-semibold tracking-tight" tone="neutral" />
            <p className="mt-2 text-xs opacity-80">
              {activeAccounts.length} active account{activeAccounts.length === 1 ? "" : "s"} · balances derived from every transaction
            </p>
          </section>

          {/* This month */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">This month</h2>
              <span className="text-xs text-muted-foreground">{monthLabel}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Income" value={data.month.income} tone="income" compact />
              <StatCard label="Expenses" value={data.month.expense} tone="expense" compact />
              <StatCard label="Net" value={data.month.net} tone="auto" compact />
            </div>
          </section>

          <QuickActions />

          {/* What is due next: the reason a fee deadline never gets forgotten. */}
          <UpcomingDues installments={data.upcoming} />

          {/* Cards & plans */}
          <section className="grid grid-cols-2 gap-2">
            <Link href="/cards" className="rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/60">
              <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Card outstanding <ChevronRight className="size-3.5" aria-hidden />
              </p>
              <Money value={data.cards.outstanding} className="mt-1 block text-lg font-semibold" tone={Number(data.cards.outstanding) > 0 ? "expense" : "muted"} />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.cards.utilisation !== null ? `${data.cards.utilisation}% of limit used` : `${data.cards.cards} card${data.cards.cards === 1 ? "" : "s"}`}
              </p>
            </Link>
            <Link href="/investments" className="rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/60">
              <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Investments <ChevronRight className="size-3.5" aria-hidden />
              </p>
              <Money value={data.investments.currentValue} className="mt-1 block text-lg font-semibold" />
              <p className="mt-0.5 text-xs text-muted-foreground">
                Gain <Money value={data.investments.gain} signed tone={Number(data.investments.gain) >= 0 ? "income" : "expense"} />
              </p>
            </Link>
          </section>

          {/* Trading & loans */}
          <section className="grid grid-cols-2 gap-2">
            <Link href={`/trading${owner === "ALL" ? "" : `?owner=${owner}`}`} className="rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/60">
              <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Trading capital <ChevronRight className="size-3.5" aria-hidden />
              </p>
              <Money value={data.trading.capital} className="mt-1 block text-lg font-semibold" />
              <p className="mt-0.5 text-xs text-muted-foreground">
                Net result <Money value={data.trading.netResult} signed tone="auto" className={cn(Number(data.trading.netResult) > 0 && "text-income")} />
              </p>
            </Link>
            <Link href="/loans" className="rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/60">
              <p className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Loans <ChevronRight className="size-3.5" aria-hidden />
              </p>
              <p className="mt-1 text-sm">
                You owe <Money value={data.loans.youOwe} tone="expense" className="font-semibold" />
              </p>
              <p className="text-sm">
                Owed to you <Money value={data.loans.owedToYou} tone="income" className="font-semibold" />
              </p>
            </Link>
          </section>
        </div>

        <div className="flex flex-col gap-5 md:col-span-2">
          {/* Accounts */}
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Accounts</h2>
              <Link href="/accounts" className="text-xs font-medium text-primary hover:underline">
                Manage
              </Link>
            </div>
            {data.accountTypeTotals.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {data.accountTypeTotals.map((t) => (
                  <Link
                    key={t.type}
                    href="/accounts"
                    className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 transition-colors hover:bg-muted"
                  >
                    <span className="text-xl" aria-hidden>
                      {ACCOUNT_TYPE_ICONS[t.type]}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[t.type]}</span>
                      <Money value={t.total} className="block text-sm font-semibold" />
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
            <ul className="flex flex-col">
              {activeAccounts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/accounts/${a.id}`}
                    className="flex items-center gap-2 rounded-lg px-1.5 py-2 text-sm transition-colors hover:bg-muted/60"
                  >
                    <span aria-hidden>{ACCOUNT_TYPE_ICONS[a.type]}</span>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {a.owner === "BROTHER" && owner === "ALL" ? (
                      <span className="rounded-md bg-trading/15 px-1.5 py-0.5 text-[10px] font-semibold text-trading uppercase">Brother</span>
                    ) : null}
                    <Money value={a.balance} className="font-medium" />
                  </Link>
                </li>
              ))}
              {activeAccounts.length === 0 ? <li className="py-2 text-sm text-muted-foreground">No accounts yet.</li> : null}
            </ul>
          </section>

          {/* Spending */}
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Spending this month</h2>
              <Link href="/reports" className="text-xs font-medium text-primary hover:underline">
                Reports
              </Link>
            </div>
            <SpendingDonut
              data={data.spendingByCategory}
              total={data.month.expense}
              height={200}
              maxLegend={6}
              linkQuery={`from=${data.month.range.from}&to=${data.month.range.to}`}
            />
          </section>
        </div>
      </div>

      {/* Recent */}
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent transactions</h2>
          <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        {data.recent.length > 0 ? (
          <TransactionList transactions={data.recent} showOwner={owner === "ALL"} />
        ) : (
          <EmptyState
            title="No transactions yet"
            description="Record your first expense, income or transfer."
            action={
              <Button size="lg" className="h-11 rounded-xl" render={<Link href="/transactions/new" />}>
                Add transaction
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
