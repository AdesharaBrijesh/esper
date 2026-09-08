import { requireUser } from "@/lib/auth/dal";
import { getCategories, getCategoryUsage } from "@/lib/data/categories";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryList } from "@/components/categories/category-list";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser();
  const [categories, usageMap] = await Promise.all([getCategories(user.id, { includeInactive: true }), getCategoryUsage(user.id)]);
  const usage = Object.fromEntries(usageMap);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Categories" description="Organise your expenses and income" backHref="/settings" backLabel="Settings" />
      <CategoryList categories={categories} usage={usage} />
    </div>
  );
}
