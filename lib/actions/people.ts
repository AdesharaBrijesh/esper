"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth/dal";
import { parseOrThrow, revalidateAll, runAction } from "@/lib/actions/helpers";
import { personSchema, type PersonInput } from "@/lib/validations/person";
import { AppError, NotFoundError } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function createPersonAction(input: PersonInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(personSchema, input);
    const duplicate = await prisma.person.findFirst({
      where: { userId, name: { equals: data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("A person with this name already exists.", { name: ["Name already exists"] });
    const created = await prisma.person.create({ data: { userId, ...data }, select: { id: true } });
    revalidateAll();
    return created;
  });
}

export async function updatePersonAction(id: string, input: PersonInput): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const data = parseOrThrow(personSchema, input);
    const existing = await prisma.person.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Person");
    const duplicate = await prisma.person.findFirst({
      where: { userId, id: { not: id }, name: { equals: data.name, mode: "insensitive" } },
      select: { id: true },
    });
    if (duplicate) throw new AppError("A person with this name already exists.", { name: ["Name already exists"] });
    await prisma.person.update({ where: { id }, data });
    revalidateAll();
    return { id };
  });
}

/**
 * Delete a person together with their GAVE / GOT entries (which also reverses whatever
 * those entries did to account balances). Blocked while old-style loans exist, since
 * those carry their own repayment bookkeeping.
 */
export async function deletePersonAction(id: string): Promise<ActionResult<{ deletedEntries: number }>> {
  const userId = await requireUserId();
  return runAction(async () => {
    const existing = await prisma.person.findFirst({ where: { id, userId }, select: { id: true } });
    if (!existing) throw new NotFoundError("Person");
    const loans = await prisma.loan.count({ where: { userId, personId: id } });
    if (loans > 0) throw new AppError("This person has older loan records. Delete those transactions first.");
    const deletedEntries = await prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.deleteMany({ where: { userId, personId: id, type: { in: ["GAVE", "GOT"] } } });
      await tx.person.delete({ where: { id } });
      return count;
    });
    revalidateAll();
    return { deletedEntries };
  });
}
