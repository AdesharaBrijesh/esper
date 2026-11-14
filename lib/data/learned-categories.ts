import "server-only";
import { prisma } from "@/lib/prisma";
import { buildLearnedHints, type LearnedHints } from "@/lib/calculations/categorize";

/**
 * What the user has filed their own expense descriptions under, newest first, so
 * "burger" lands wherever they put "burger" last time. Small enough to ship to the
 * client for the live quick-add preview.
 */
export async function getLearnedCategoryHints(userId: string): Promise<LearnedHints> {
  const rows = await prisma.transaction.findMany({
    where: { userId, type: "EXPENSE", notes: { not: null }, categoryId: { not: null } },
    select: { notes: true, categoryId: true },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take: 1500,
  });
  return buildLearnedHints(rows);
}
