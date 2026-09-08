import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { countAccountTransactions, getAccountById } from "@/lib/data/accounts";
import { listTransactions } from "@/lib/data/transactions";
import { PageHeader } from "@/components/shared/page-header";
import { Money } from "@/components/shared/money";
import { TransactionList } from "@/components/shared/transaction-row";
import { Pagination } from "@/components/shared/pagination";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountActions } from "@/components/accounts/account-actions";
import { Badge } from "@/components/ui/badge";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, OWNER_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const account = await getAccountById(user.id, id);
  return { title: account?.name ?? "Account" };
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const account = await getAccountById(user.id, id);
  if (!account) notFound();

  const pageNum = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const [txns, count] = await Promise.all([
    listTransactions(user.id, { accountId: id, page: pageNum }),
    countAccountTransactions(user.id, id),
  ]);

  const returnTo = `/accounts/${id}`;
  const q = (type: string, side: "from" | "to") =>
    `/transactions/new?type=${type}&${side === "from" ? "fromAccountId" : "toAccountId"}=${id}&owner=${account.owner}&returnTo=${encodeURIComponent(returnTo)}`;
  const quick =
    account.type === "TRADING"
      ? [
          { label: "Deposit", href: q("TRADING_DEPOSIT", "to"), cls: "bg-transfer/10 text-transfer" },
          { label: "Withdraw", href: q("TRADING_WITHDRAWAL", "from"), cls: "bg-transfer/10 text-transfer" },
          { label: "Add profit", href: q("TRADING_PROFIT", "to"), cls: "bg-income/10 text-income" },
          { label: "Add loss", href: q("TRADING_LOSS", "from"), cls: "bg-expense/10 text-expense" },
        ]
      : [
          { label: "Add expense", href: q("EXPENSE", "from"), cls: "bg-expense/10 text-expense" },
          { label: "Add income", href: q("INCOME", "to"), cls: "bg-income/10 text-income" },
          { label: "Transfer", href: q("TRANSFER", "from"), cls: "bg-transfer/10 text-transfer" },
        ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden>{ACCOUNT_TYPE_ICONS[account.type]}</span>
            {account.name}
          </span>
        }
        backHref="/accounts"
        backLabel="Accounts"
        actions={<AccountFormDialog account={account} triggerVariant="outline" />}
      />

      <section className={cn("rounded-3xl border bg-card p-5", !account.isActive && "opacity-80")}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
          <Badge variant={account.owner === "BROTHER" ? "default" : "outline"}>{OWNER_LABELS[account.owner]}</Badge>
          {!account.isActive ? <Badge variant="destructive">Archived</Badge> : null}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Current balance</p>
        <Money value={account.balance} className="block text-4xl font-semibold tracking-tight" />
        <p className="mt-1 text-xs text-muted-foreground">
          Opening balance <Money value={account.openingBalance} className="font-medium" /> · {count} transaction{count === 1 ? "" : "s"}
        </p>
      </section>

      {account.isActive ? (
        <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quick.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className={cn("flex h-12 items-center justify-center rounded-xl text-sm font-medium transition-colors hover:opacity-90", a.cls)}
            >
              {a.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <AccountActions account={account} transactionCount={count} />
      {count > 0 ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          This account has transactions, so it can be archived but not deleted.
        </p>
      ) : null}

      <section className="rounded-2xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-base font-semibold">History</h2>
          <Link href={`/transactions?accountId=${id}`} className="text-xs font-medium text-primary hover:underline">
            Open in Activity
          </Link>
        </div>
        <TransactionList transactions={txns.items} emptyMessage="No transactions for this account yet." />
        <Pagination page={txns.page} pageSize={txns.pageSize} total={txns.total} hasMore={txns.hasMore} className="mt-3" />
      </section>
    </div>
  );
}
