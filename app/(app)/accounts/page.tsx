import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getAccountsWithBalances, netWorthOf } from "@/lib/data/accounts";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { RestoreAccountButton } from "@/components/accounts/account-actions";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_LABELS, OWNER_LABELS, OWNERS } from "@/lib/constants";
import type { AccountDTO } from "@/lib/types";

export const metadata = { title: "Accounts" };

function AccountRow({ account }: { account: AccountDTO }) {
  return (
    <Link
      href={`/accounts/${account.id}`}
      className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden>
        {ACCOUNT_TYPE_ICONS[account.type]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{account.name}</span>
        <span className="block text-xs text-muted-foreground">{ACCOUNT_TYPE_LABELS[account.type]}</span>
      </span>
      <Money value={account.balance} className="font-semibold" />
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await getAccountsWithBalances(user.id, { includeInactive: true });
  const active = accounts.filter((a) => a.isActive);
  const archived = accounts.filter((a) => !a.isActive);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        description="Balances = opening balance + every transaction"
        actions={<AccountFormDialog />}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon="🏦"
          title="No accounts yet"
          description="Create your cash, bank, UPI, card and trading accounts. Give each its current balance as the opening balance."
          action={<AccountFormDialog triggerLabel="Create first account" triggerClassName="h-11 rounded-xl" />}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 lg:gap-3">
            <StatCard label="Net worth" value={netWorthOf(active, "ALL")} compact />
            <StatCard label="Self" value={netWorthOf(active, "SELF")} compact />
            <StatCard label="Brother" value={netWorthOf(active, "BROTHER")} compact />
          </div>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          {OWNERS.map((owner) => {
            const list = active.filter((a) => a.owner === owner);
            if (list.length === 0) return null;
            return (
              <section key={owner} className="rounded-2xl border bg-card p-3">
                <div className="mb-1 flex items-center justify-between px-2">
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{OWNER_LABELS[owner]}</h2>
                  <Money value={netWorthOf(list, owner)} className="text-xs font-medium text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  {list.map((a) => (
                    <AccountRow key={a.id} account={a} />
                  ))}
                </div>
              </section>
            );
          })}
          </div>

          {archived.length > 0 ? (
            <details className="rounded-2xl border bg-card p-3">
              <summary className="cursor-pointer px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Archived ({archived.length})
              </summary>
              <div className="mt-1 flex flex-col">
                {archived.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-2 py-2 opacity-70">
                    <span className="text-xl" aria-hidden>
                      {ACCOUNT_TYPE_ICONS[a.type]}
                    </span>
                    <Link href={`/accounts/${a.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                      {a.name} <span className="text-xs text-muted-foreground">· {OWNER_LABELS[a.owner]}</span>
                    </Link>
                    <Money value={a.balance} className="text-sm" />
                    <RestoreAccountButton id={a.id} />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
