"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { categorySchema, type CategoryInput } from "@/lib/validations/category";
import { AppError, NotFoundError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function createCategoryAction(input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(categorySchema, input);
    const count = await prisma.category.count({ where: { userId, type: data.type } });
    const created = await prisma.category.create({
      data: { userId, ...data, sortOrder: count },
      select: { id: true },
    });
    revalidateAll();
    return created;
  });
}

export async function updateCategoryAction(id: string, input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(categorySchema, input);
    const existing = await prisma.category.findFirst({ where: { id, userId }, select: { id: true, type: true } });
    if (!existing) throw new NotFoundError("Category");
    if (existing.type !== data.type) {
      const used = await prisma.transaction.count({ where: { userId, categoryId: id } });
      if (used > 0) throw new AppError("Cannot change the type of a category that already has transactions.");
    }
    await prisma.category.update({ where: { id }, data });
    revalidateAll();
    return { id };
  });
}

export async function setCategoryActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Category");
    await prisma.category.update({ where: { id }, data: { isActive } });
    revalidateAll();
    return null;
  });
}

/** Hard delete, only allowed when no transactions use the category. */
export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Category");
    const used = await prisma.transaction.count({ where: { userId, categoryId: id } });
    if (used > 0) throw new AppError("This category is used by transactions. Disable it instead of deleting.");
    await prisma.category.delete({ where: { id } });
    revalidateAll();
    return null;
  });
}
