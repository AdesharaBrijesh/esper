import { requireUser } from "@/lib/auth/dal";
import { getAccountsWithBalances } from "@/lib/data/accounts";
import { getCategories } from "@/lib/data/categories";
import { getLearnedCategoryHints } from "@/lib/data/learned-categories";
import { PageHeader } from "@/components/shared/page-header";
import { AddModeTabs } from "@/components/transactions/add-mode-tabs";
import { QuickAdd } from "@/components/transactions/quick-add";

export const metadata = { title: "Quick add" };

export default async function QuickAddPage() {
  const user = await requireUser();
  const [accounts, categories, learned] = await Promise.all([
    getAccountsWithBalances(user.id),
    getCategories(user.id),
    getLearnedCategoryHints(user.id),
  ]);
  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-2xl">
      <PageHeader title="Quick add" description="Type the day's spends, one per line." backHref="/" />
      <AddModeTabs active="quick" className="mb-4" />
      <QuickAdd accounts={accounts} categories={categories} learned={learned} />
    </div>
  );
}
