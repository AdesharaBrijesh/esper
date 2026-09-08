import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, TrendingDown, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getTradingOverview } from "@/lib/data/trading";
import { OwnerFilterTabs } from "@/components/shared/owner-filter";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { TransactionList } from "@/components/shared/transaction-row";
import { TradingMonthlyChart } from "@/components/charts/trading-monthly-chart";
import { Button } from "@/components/ui/button";
import { OWNER_LABELS, OWNERS, parseOwnerFilter, type Owner } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trading" };

export default async function TradingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const owner = parseOwnerFilter(sp.owner);
  const data = await getTradingOverview(user.id, owner, { limit: 100 });
  const activeTrading = data.tradingAccounts.filter((a) => a.isActive);
  const actionOwner: Owner = owner === "ALL" ? "SELF" : owner;
  const ownerAccounts = activeTrading.filter((a) => a.owner === actionOwner);
  const single = ownerAccounts.length === 1 ? ownerAccounts[0].id : undefined;
  const returnTo = encodeURIComponent(`/trading${owner === "ALL" ? "" : `?owner=${owner}`}`);
  const q = (type: string, side: "from" | "to") =>
    `/transactions/new?type=${type}&owner=${actionOwner}${single ? `&${side === "from" ? "fromAccountId" : "toAccountId"}=${single}` : ""}&returnTo=${returnTo}`;

  const actions = [
    { label: "Deposit", href: q("TRADING_DEPOSIT", "to"), icon: ArrowDownToLine, cls: "bg-transfer/10 text-transfer" },
    { label: "Withdraw", href: q("TRADING_WITHDRAWAL", "from"), icon: ArrowUpFromLine, cls: "bg-transfer/10 text-transfer" },
    { label: "Add profit", href: q("TRADING_PROFIT", "to"), icon: TrendingUp, cls: "bg-income/10 text-income" },
    { label: "Add loss", href: q("TRADING_LOSS", "from"), icon: TrendingDown, cls: "bg-expense/10 text-expense" },
  ];
  const s = data.summary;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Trading" description="Capital, deposits, withdrawals and results per owner" actions={<OwnerFilterTabs value={owner} />} />

      {activeTrading.length === 0 ? (
        <EmptyState
          icon="📈"
          title={owner === "ALL" ? "No trading account yet" : `No ${OWNER_LABELS[owner]} trading account`}
          description="Create an account with type Trading for Self and/or Brother. Deposits, profits and losses then move money in and out of it."
          action={
            <Button size="lg" className="h-11 rounded-xl" render={<Link href="/accounts" />}>
              Go to accounts
            </Button>
          }
        />
      ) : (
        <>
          <section className="rounded-3xl bg-trading p-5 text-white shadow-md shadow-trading/20">
            <p className="text-sm opacity-85">Trading capital · {owner === "ALL" ? "All" : OWNER_LABELS[owner]}</p>
            <Money value={data.capital} tone="neutral" className="mt-1 block text-4xl font-semibold tracking-tight" />
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
              {activeTrading.map((a) => (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} className="underline-offset-2 hover:underline">
                    {a.name}
                  </Link>{" "}
                  · <Money value={a.balance} tone="neutral" />
                </li>
              ))}
            </ul>
          </section>

          <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className={cn("flex h-14 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90", a.cls)}
                >
                  <Icon className="size-5" aria-hidden />
                  {a.label}
                </Link>
              );
            })}
          </nav>
          {owner === "ALL" ? <p className="-mt-3 text-xs text-muted-foreground">Quick actions default to Self; change the owner in the form.</p> : null}

          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label="Total deposits" value={s.deposits} compact />
            <StatCard label="Total withdrawals" value={s.withdrawals} compact />
            <StatCard label="Net invested" value={s.netInvested} hint="deposits − withdrawals" compact />
            <StatCard label="Total profit" value={s.profit} tone="income" hint={`${s.profitCount} entr${s.profitCount === 1 ? "y" : "ies"}`} compact />
            <StatCard label="Total loss" value={s.loss} tone="expense" hint={`${s.lossCount} entr${s.lossCount === 1 ? "y" : "ies"}`} compact />
            <StatCard label="Net result" value={s.netResult} tone={Number(s.netResult) >= 0 ? "income" : "expense"} hint="profit − loss" compact />
          </section>

          {owner === "ALL" ? (
            <section className="grid grid-cols-2 gap-2">
              {OWNERS.map((o) => (
                <Link key={o} href={`/trading?owner=${o}`} className="rounded-2xl border bg-card p-3.5 transition-colors hover:bg-muted/60">
                  <p className="text-xs font-medium text-muted-foreground">{OWNER_LABELS[o]}</p>
                  <Money value={data.capitalByOwner[o]} className="mt-1 block text-lg font-semibold" />
                  <p className="text-xs text-muted-foreground">
                    Net result{" "}
                    <Money value={data.byOwner[o].netResult} signed tone={Number(data.byOwner[o].netResult) >= 0 ? "income" : "expense"} className="font-medium" />
                  </p>
                </Link>
              ))}
            </section>
          ) : null}

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="mb-2 text-base font-semibold">Profit &amp; loss · last 6 months</h2>
            <TradingMonthlyChart transactions={data.transactions} />
          </section>

          <section className="rounded-2xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="text-base font-semibold">Trading activity</h2>
              <Link href={`/transactions?group=TRADING${owner === "ALL" ? "" : `&owner=${owner}`}`} className="text-xs font-medium text-primary hover:underline">
                See all
              </Link>
            </div>
            <TransactionList transactions={data.transactions.slice(0, 30)} emptyMessage="No trading transactions yet." showOwner={owner === "ALL"} />
          </section>

          <p className="text-xs text-muted-foreground">
            Profit and loss change the trading account balance directly. They are reported separately from regular income and expenses so
            spending reports stay accurate. Transfer money to Brother with a normal transfer from a Self account to a Brother account.
          </p>
        </>
      )}
    </div>
  );
}
