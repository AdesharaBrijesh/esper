import Link from "next/link";
import { Download, Plus, Upload } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listTransactions } from "@/lib/data/transactions";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { getPeople } from "@/lib/data/people";
import { filtersToSearchParams, parseTransactionFilters } from "@/lib/validations/filters";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionList } from "@/components/shared/transaction-row";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Activity" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseTransactionFilters(sp);
  const [page, accounts, categories, people] = await Promise.all([
    listTransactions(user.id, filters),
    getAccountsWithBalances(user.id, { includeInactive: true }),
    getCategories(user.id, { includeInactive: true }),
    getPeople(user.id),
  ]);
  const { page: _page, ...rest } = filters;
  void _page;
  const hasFilters = Object.values(rest).some((v) => v !== undefined && v !== "");
  const exportHref = `/api/export/transactions?${filtersToSearchParams(rest).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Activity"
        description={`${page.total} transaction${page.total === 1 ? "" : "s"}${hasFilters ? " match your filters" : ""}`}
        actions={
          <>
            <Button variant="outline" size="lg" className="h-10 rounded-xl" render={<Link href="/transactions/import" />}>
              <Upload className="size-4" aria-hidden />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="outline" size="lg" className="h-10 rounded-xl" render={<a href={exportHref} download />}>
              <Download className="size-4" aria-hidden />
              <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button size="lg" className="h-10 rounded-xl" render={<Link href="/transactions/new?returnTo=/transactions" />}>
              <Plus className="size-4" strokeWidth={2.5} aria-hidden />
              Add
            </Button>
          </>
        }
      />

      <TransactionFilters filters={filters} accounts={accounts} categories={categories} people={people} />

      {page.items.length > 0 ? (
        <>
          <TransactionList transactions={page.items} />
          <Pagination page={page.page} pageSize={page.pageSize} total={page.total} hasMore={page.hasMore} />
        </>
      ) : hasFilters ? (
        <EmptyState
          title="No matching transactions"
          description="Try widening the date range or clearing some filters."
          action={
            <Button variant="outline" size="lg" className="h-11 rounded-xl" render={<Link href="/transactions" />}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon="🧾"
          title="No transactions yet"
          description="Add your first expense, income or transfer and it will show up here."
          action={
            <Button size="lg" className="h-11 rounded-xl" render={<Link href="/transactions/new" />}>
              Add transaction
            </Button>
          }
        />
      )}
    </div>
  );
}
