import Link from "next/link";
import { Download } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getReportData } from "@/lib/data/reports";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Money } from "@/components/shared/money";
import { ReportControls } from "@/components/reports/report-controls";
import { SpendingDonut } from "@/components/charts/spending-donut";
import { MonthlyTrendChart } from "@/components/charts/monthly-trend-chart";
import { BreakdownBars } from "@/components/charts/breakdown-bars";
import { Button } from "@/components/ui/button";
import { OWNER_LABELS, OWNERS, PAYMENT_MODE_LABELS, parseOwnerFilter } from "@/lib/constants";
import { isDateOnly, presetRange, type DateRange, type RangePreset } from "@/lib/dates";

export const metadata = { title: "Reports" };

const PRESETS: RangePreset[] = ["this-month", "last-month", "last-3-months", "this-year", "custom"];

function Section({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const owner = parseOwnerFilter(sp.owner);
  const rawPreset = typeof sp.preset === "string" ? sp.preset : "this-month";
  const preset: RangePreset = (PRESETS as string[]).includes(rawPreset) ? (rawPreset as RangePreset) : "this-month";
  let range: DateRange = presetRange(preset === "custom" ? "this-month" : preset);
  if (preset === "custom") {
    const from = typeof sp.from === "string" && isDateOnly(sp.from) ? sp.from : range.from;
    const to = typeof sp.to === "string" && isDateOnly(sp.to) ? sp.to : range.to;
    range = from <= to ? { from, to } : { from: to, to: from };
  }

  const data = await getReportData(user.id, range, owner);
  const rangeQs = `from=${range.from}&to=${range.to}${owner === "ALL" ? "" : `&owner=${owner}`}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        actions={
          <Button variant="outline" size="lg" className="h-10 rounded-xl" render={<a href={`/api/export/transactions?${rangeQs}`} download />}>
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline">Export range</span>
          </Button>
        }
      />
      <ReportControls preset={preset} range={range} owner={owner} />

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Income" value={data.totals.income} tone="income" compact />
        <StatCard label="Expenses" value={data.totals.expense} tone="expense" compact />
        <StatCard label="Net" value={data.totals.net} tone="auto" compact />
        <div className="flex flex-col gap-1 rounded-2xl border bg-card p-3.5">
          <p className="text-xs font-medium text-muted-foreground">Transactions</p>
          <p className="text-lg font-semibold md:text-xl">{data.totals.transactionCount}</p>
          <p className="text-xs text-muted-foreground">all types, in range</p>
        </div>
      </section>

      <Section title="Spending by category" description="Expenses only. Tap a category to see its transactions.">
        <SpendingDonut data={data.spendingByCategory} total={data.totals.expense} linkQuery={rangeQs} maxLegend={12} />
        {data.incomeByCategory.length > 0 ? (
          <div className="mt-5 border-t pt-4">
            <h3 className="mb-2 text-sm font-semibold">Income by category</h3>
            <BreakdownBars
              rows={data.incomeByCategory.map((c) => ({
                key: c.categoryId,
                label: `${c.icon ?? ""} ${c.name}`.trim(),
                value: c.total,
                percent: c.percent,
                color: c.color ?? "var(--income)",
                href: `/transactions?categoryId=${c.categoryId}&${rangeQs}`,
              }))}
            />
          </div>
        ) : null}
      </Section>

      <Section title="Monthly income vs expenses" description="Trend across the months in the selected range.">
        <MonthlyTrendChart data={data.monthly} />
      </Section>

      <Section title="Owner breakdown" description={owner === "ALL" ? "Self vs Brother." : `Showing ${OWNER_LABELS[owner]} only – switch to All to compare.`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.owners
            .filter((o) => owner === "ALL" || o.owner === owner)
            .map((o) => (
              <div key={o.owner} className="rounded-xl bg-muted/50 p-3">
                <p className="text-sm font-semibold">{OWNER_LABELS[o.owner]}</p>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Income</dt>
                    <dd>
                      <Money value={o.income} tone="income" className="font-medium" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Expenses</dt>
                    <dd>
                      <Money value={o.expense} tone="expense" className="font-medium" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Net</dt>
                    <dd>
                      <Money value={o.net} className="font-medium" />
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
        </div>
        {owner === "ALL" ? (
          <div className="mt-3">
            <BreakdownBars
              rows={data.owners.map((o) => ({ key: o.owner, label: `${OWNER_LABELS[o.owner]} spending`, value: o.expense, color: o.owner === "SELF" ? "var(--chart-1)" : "var(--trading)" }))}
              emptyMessage="No spending in this period."
            />
          </div>
        ) : null}
      </Section>

      <Section title="Payment mode" description="How expenses were paid.">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <StatCard label="Cash" value={data.cashVsOnline.cash} compact />
          <StatCard label="Online (UPI / bank / card)" value={data.cashVsOnline.online} compact />
        </div>
        <BreakdownBars
          rows={data.paymentModes.map((p) => ({
            key: p.mode,
            label: PAYMENT_MODE_LABELS[p.mode],
            value: p.total,
            percent: p.percent,
            hint: `${p.count} transaction${p.count === 1 ? "" : "s"}`,
            href: `/transactions?paymentMode=${p.mode}&group=EXPENSE&${rangeQs}`,
          }))}
          emptyMessage="No expenses in this period."
        />
      </Section>

      <Section
        title="Trading summary"
        description="Per owner, within the selected range. Capital is the current balance."
        action={
          <Link href="/trading" className="text-xs font-medium text-primary hover:underline">
            Open trading
          </Link>
        }
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {(["SELF", "BROTHER", "ALL"] as const).map((o) => {
            const t = data.trading[o];
            return (
              <Link key={o} href={`/trading${o === "ALL" ? "" : `?owner=${o}`}`} className="rounded-xl bg-muted/50 p-3 transition-colors hover:bg-muted">
                <p className="text-sm font-semibold">{o === "ALL" ? "All" : OWNER_LABELS[o]}</p>
                <p className="text-xs text-muted-foreground">
                  Capital <Money value={data.tradingCapital[o]} className="font-medium text-foreground" />
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Deposits</dt>
                  <dd className="text-right">
                    <Money value={t.deposits} />
                  </dd>
                  <dt className="text-muted-foreground">Withdrawals</dt>
                  <dd className="text-right">
                    <Money value={t.withdrawals} />
                  </dd>
                  <dt className="text-muted-foreground">Profit</dt>
                  <dd className="text-right">
                    <Money value={t.profit} tone="income" />
                  </dd>
                  <dt className="text-muted-foreground">Loss</dt>
                  <dd className="text-right">
                    <Money value={t.loss} tone="expense" />
                  </dd>
                  <dt className="font-medium">Net result</dt>
                  <dd className="text-right font-semibold">
                    <Money value={t.netResult} tone={Number(t.netResult) >= 0 ? "income" : "expense"} />
                  </dd>
                </dl>
              </Link>
            );
          })}
        </div>
        {OWNERS.every((o) => data.trading[o].deposits === "0.00" && data.trading[o].profit === "0.00" && data.trading[o].loss === "0.00") ? (
          <p className="mt-2 text-xs text-muted-foreground">No trading activity in this period.</p>
        ) : null}
      </Section>

      <Section
        title="Loans"
        description="Outstanding balances right now (not limited to the range)."
        action={
          <Link href="/loans" className="text-xs font-medium text-primary hover:underline">
            Open people
          </Link>
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="You owe" value={data.loans.youOwe} tone="expense" compact />
          <StatCard label="Owed to you" value={data.loans.owedToYou} tone="income" compact />
          <StatCard label="Net" value={data.loans.net} tone="auto" compact />
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" className="h-10 rounded-xl" render={<a href="/api/export/accounts" download />}>
          <Download className="size-4" aria-hidden /> Accounts CSV
        </Button>
        <Button variant="outline" size="lg" className="h-10 rounded-xl" render={<a href="/api/export/loans" download />}>
          <Download className="size-4" aria-hidden /> Loans CSV
        </Button>
      </div>
    </div>
  );
}
