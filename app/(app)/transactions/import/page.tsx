import { requireUser } from "@/lib/auth/dal";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { PageHeader } from "@/components/shared/page-header";
import { StatementImportWizard } from "@/components/transactions/statement-import";

export const metadata = { title: "Import statement" };

export default async function ImportStatementPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    getAccountsWithBalances(user.id),
    getCategories(user.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Import bank statement"
        description="Upload a CSV export, review the auto-categorised transactions, then approve them all at once."
        backHref="/transactions"
      />
      <StatementImportWizard accounts={accounts} categories={categories} />
    </div>
  );
}
