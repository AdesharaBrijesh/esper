import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getTransactionById } from "@/lib/data/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { getPeople } from "@/lib/data/people";
import { getLoans } from "@/lib/data/loans";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionAmount } from "@/components/shared/money";
import { TransactionIcon, transactionTitle } from "@/components/shared/transaction-row";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { OWNER_LABELS, PAYMENT_MODE_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import { formatDateOnly } from "@/lib/dates";
import { safePath } from "@/lib/safe-path";

export const metadata = { title: "Transaction" };

export default async function TransactionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const returnTo = safePath(sp.returnTo, "/transactions");

  const transaction = await getTransactionById(user.id, id);
  if (!transaction) notFound();

  const [accounts, categories, people, loans] = await Promise.all([
    getAccountsWithBalances(user.id, { includeInactive: true }),
    getCategories(user.id, { includeInactive: true }),
    getPeople(user.id),
    getLoans(user.id, { status: "ALL" }),
  ]);

  const t = transaction;
  const details: { label: string; value: React.ReactNode }[] = [
    { label: "Type", value: TRANSACTION_TYPE_LABELS[t.type] },
    { label: "Date", value: formatDateOnly(t.transactionDate, { weekday: true }) },
    ...(t.fromAccount
      ? [{ label: "From", value: <Link href={`/accounts/${t.fromAccount.id}`} className="underline-offset-2 hover:underline">{t.fromAccount.name}</Link> }]
      : []),
    ...(t.toAccount
      ? [{ label: "To", value: <Link href={`/accounts/${t.toAccount.id}`} className="underline-offset-2 hover:underline">{t.toAccount.name}</Link> }]
      : []),
    ...(t.loan
      ? [{ label: "Person", value: <Link href={`/loans/${t.loan.personId}`} className="underline-offset-2 hover:underline">{t.loan.personName}</Link> }]
      : []),
    { label: "Owner", value: OWNER_LABELS[t.owner] },
    { label: "Payment mode", value: PAYMENT_MODE_LABELS[t.paymentMode] },
  ];

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title="Transaction" backHref={returnTo} actions={<DeleteTransactionButton id={t.id} returnTo={returnTo} />} />

      <section className="mb-6 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <TransactionIcon t={t} className="size-12 text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{transactionTitle(t)}</p>
            {t.notes ? <p className="truncate text-sm text-muted-foreground">{t.notes}</p> : null}
          </div>
          <TransactionAmount type={t.type} amount={t.amount} className="text-xl" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {details.map((d) => (
            <div key={d.label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{d.label}</dt>
              <dd className="font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <h2 className="mb-3 text-base font-semibold">Edit</h2>
      <TransactionForm
        mode="edit"
        transaction={t}
        accounts={accounts}
        categories={categories}
        people={people}
        loans={loans}
        prefill={{ returnTo }}
      />
    </div>
  );
}
