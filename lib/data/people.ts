import "server-only";
import { prisma } from "@/lib/prisma";
import { toPersonDTO } from "@/lib/serialize";
import type { PersonDTO } from "@/lib/types";

export async function getPeople(userId: string): Promise<PersonDTO[]> {
  const rows = await prisma.person.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return rows.map(toPersonDTO);
}

export async function getPersonById(userId: string, id: string): Promise<PersonDTO | null> {
  const row = await prisma.person.findFirst({ where: { id, userId } });
  return row ? toPersonDTO(row) : null;
}

export async function countPersonLoans(userId: string, personId: string): Promise<number> {
  return prisma.loan.count({ where: { userId, personId } });
}
