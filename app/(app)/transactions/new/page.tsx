import { requireUser } from "@/lib/auth/dal";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { getPeople } from "@/lib/data/people";
import { getLoans } from "@/lib/data/loans";
import { safePath } from "@/lib/safe-path";
import { PageHeader } from "@/components/shared/page-header";
import { TransactionForm, type TransactionFormPrefill } from "@/components/transactions/transaction-form";

export const metadata = { title: "Add transaction" };

type SearchParams = Record<string, string | string[] | undefined>;

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s.slice(0, 200) : undefined;
}

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [accounts, categories, people, loans] = await Promise.all([
    getAccountsWithBalances(user.id),
    getCategories(user.id),
    getPeople(user.id),
    getLoans(user.id, { status: "ACTIVE" }),
  ]);

  const returnTo = safePath(str(sp.returnTo), "/");
  const prefill: TransactionFormPrefill = {
    type: str(sp.type),
    fromAccountId: str(sp.fromAccountId),
    toAccountId: str(sp.toAccountId),
    categoryId: str(sp.categoryId),
    owner: str(sp.owner),
    loanId: str(sp.loanId),
    personId: str(sp.personId),
    amount: str(sp.amount),
    notes: str(sp.notes),
    returnTo: sp.returnTo ? returnTo : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <PageHeader title="Add transaction" backHref={returnTo} />
      <TransactionForm mode="create" accounts={accounts} categories={categories} people={people} loans={loans} prefill={prefill} />
    </div>
  );
}
