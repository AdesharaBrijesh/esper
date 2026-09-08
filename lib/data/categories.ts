import "server-only";
import { prisma } from "@/lib/prisma";
import { toCategoryDTO } from "@/lib/serialize";
import type { CategoryDTO } from "@/lib/types";
import type { CategoryType } from "@/generated/prisma/enums";

export async function getCategories(
  userId: string,
  opts: { includeInactive?: boolean; type?: CategoryType } = {},
): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    where: {
      userId,
      ...(opts.includeInactive ? {} : { isActive: true }),
      ...(opts.type ? { type: opts.type } : {}),
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toCategoryDTO);
}

export async function getCategoryById(userId: string, id: string): Promise<CategoryDTO | null> {
  const row = await prisma.category.findFirst({ where: { id, userId } });
  return row ? toCategoryDTO(row) : null;
}

/** Transaction counts per category id (for the categories screen and safe deletes). */
export async function getCategoryUsage(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { userId, categoryId: { not: null } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (r.categoryId) map.set(r.categoryId, r._count._all);
  return map;
}

/** Finds the user's category by exact name and type (e.g. "Trading Profit"). */
export async function findCategoryByName(userId: string, type: CategoryType, name: string): Promise<CategoryDTO | null> {
  const row = await prisma.category.findFirst({ where: { userId, type, name } });
  return row ? toCategoryDTO(row) : null;
}
