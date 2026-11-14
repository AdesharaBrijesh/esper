import { requireUser } from "@/lib/auth/dal";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { isAiConfigured } from "@/lib/ai/gemini";
import { PageHeader } from "@/components/shared/page-header";
import { StatementImportWizard } from "@/components/transactions/statement-import";

export const metadata = { title: "Import" };

// AI reading of a multi-page statement can take a while, and the server actions on this
// page inherit this limit (it may try a second model when the first is busy).
export const maxDuration = 150;

export default async function ImportStatementPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([getAccountsWithBalances(user.id), getCategories(user.id)]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Import"
        description="Statements, screenshots and Angel One reports. Review everything before it's added."
        backHref="/transactions"
      />
      <StatementImportWizard accounts={accounts} categories={categories} aiEnabled={isAiConfigured()} />
    </div>
  );
}
