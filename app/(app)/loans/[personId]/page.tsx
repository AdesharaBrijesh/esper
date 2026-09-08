import Link from "next/link";
import { notFound } from "next/navigation";
import { HandCoins, Handshake, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getPersonLoanDetail } from "@/lib/data/loans";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Money } from "@/components/shared/money";
import { TransactionList } from "@/components/shared/transaction-row";
import { PersonFormDialog } from "@/components/loans/person-form-dialog";
import { PersonDeleteButton } from "@/components/loans/person-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LOAN_DIRECTION_LABELS, REPAYMENT_TYPE_FOR_DIRECTION } from "@/lib/constants";
import { formatDateOnly } from "@/lib/dates";
import { toDecimal } from "@/lib/money";
import type { LoanDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ personId: string }> }) {
  const user = await requireUser();
  const { personId } = await params;
  const detail = await getPersonLoanDetail(user.id, personId);
  return { title: detail?.person.name ?? "Person" };
}

function LoanCard({ loan, returnTo }: { loan: LoanDTO; returnTo: string }) {
  const original = toDecimal(loan.originalAmount);
  const outstanding = toDecimal(loan.outstandingAmount);
  const repaid = original.minus(outstanding);
  const percent = original.isZero() ? 100 : Math.min(100, Math.max(0, Number(repaid.dividedBy(original).times(100).toFixed(0))));
  const borrowed = loan.direction === "BORROWED";
  const repayHref = `/transactions/new?type=${REPAYMENT_TYPE_FOR_DIRECTION[loan.direction]}&loanId=${loan.id}&amount=${loan.outstandingAmount}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4", loan.status === "PAID" && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={borrowed ? "destructive" : "default"} className={cn(!borrowed && "bg-income text-white")}>
              {LOAN_DIRECTION_LABELS[loan.direction]}
            </Badge>
            <Badge variant="outline">{loan.status === "PAID" ? "Paid" : "Active"}</Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Started {formatDateOnly(loan.startDate)}
            {loan.notes ? ` · ${loan.notes}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground uppercase">Outstanding</p>
          <Money value={loan.outstandingAmount} tone={borrowed ? "expense" : "income"} className="text-lg font-semibold" />
        </div>
      </div>
      <div>
        <Progress value={percent} className="h-2" />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>
            Repaid <Money value={repaid.toFixed(2)} className="font-medium text-foreground" /> of <Money value={loan.originalAmount} className="font-medium text-foreground" />
          </span>
          <span>{percent}%</span>
        </div>
      </div>
      {loan.status === "ACTIVE" ? (
        <Button size="lg" className="h-11 rounded-xl" variant={borrowed ? "default" : "outline"} render={<Link href={repayHref} />}>
          {borrowed ? "Record repayment" : "Record money received"}
        </Button>
      ) : null}
    </div>
  );
}

export default async function PersonLoansPage({ params }: { params: Promise<{ personId: string }> }) {
  const user = await requireUser();
  const { personId } = await params;
  const detail = await getPersonLoanDetail(user.id, personId);
  if (!detail) notFound();
  const { person, loans, transactions } = detail;
  const returnTo = `/loans/${person.id}`;
  const active = loans.filter((l) => l.status === "ACTIVE");
  const paid = loans.filter((l) => l.status === "PAID");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={person.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {person.phone ? (
              <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-3.5" aria-hidden />
                {person.phone}
              </a>
            ) : null}
            {person.notes ? <span>{person.notes}</span> : null}
          </span>
        }
        backHref="/loans"
        backLabel="People"
        actions={
          <>
            <PersonFormDialog person={person} />
            {loans.length === 0 ? <PersonDeleteButton id={person.id} name={person.name} /> : null}
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="You owe" value={detail.youOwe} tone="expense" compact />
        <StatCard label="Owed to you" value={detail.owedToYou} tone="income" compact />
        <StatCard label="Net" value={detail.net} tone="auto" compact />
      </div>

      <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant="secondary"
          className="h-12 rounded-xl bg-expense/10 text-expense hover:bg-expense/20"
          render={<Link href={`/transactions/new?type=BORROW&personId=${person.id}&returnTo=${encodeURIComponent(returnTo)}`} />}
        >
          <HandCoins className="size-4" aria-hidden />
          Borrow from {person.name.split(" ")[0]}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-12 rounded-xl bg-income/10 text-income hover:bg-income/20"
          render={<Link href={`/transactions/new?type=LEND&personId=${person.id}&returnTo=${encodeURIComponent(returnTo)}`} />}
        >
          <Handshake className="size-4" aria-hidden />
          Lend to {person.name.split(" ")[0]}
        </Button>
      </nav>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Loans</h2>
        {active.length === 0 && paid.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No loans with {person.name} yet.</p>
        ) : null}
        {active.map((l) => (
          <LoanCard key={l.id} loan={l} returnTo={returnTo} />
        ))}
        {paid.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted-foreground uppercase">Settled ({paid.length})</summary>
            <div className="mt-2 flex flex-col gap-3">
              {paid.map((l) => (
                <LoanCard key={l.id} loan={l} returnTo={returnTo} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card p-3">
        <h2 className="mb-2 px-2 text-base font-semibold">History</h2>
        <TransactionList transactions={transactions} emptyMessage="No loan transactions yet." showOwner={false} />
      </section>
    </div>
  );
}
