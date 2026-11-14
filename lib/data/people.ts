import "server-only";
import { prisma } from "@/lib/prisma";
import { toPersonDTO, toTransactionDTO, transactionInclude } from "@/lib/serialize";
import { ledgerTotals, personBalance, withRunningBalance } from "@/lib/calculations/ledger";
import { PERSON_BALANCE_SIGN, type TransactionType } from "@/lib/constants";
import { moneyToString } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import type { PersonDTO, TransactionDTO } from "@/lib/types";

/** Transaction types that move money between you and a person. */
const LEDGER_TYPES = Object.keys(PERSON_BALANCE_SIGN) as TransactionType[];

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

export interface PersonSummaryDTO extends PersonDTO {
  /** Positive: they owe you. Negative: you owe them. */
  balance: string;
  gave: string;
  got: string;
  entryCount: number;
  lastActivity: string | null;
}

export interface PeopleLedger {
  people: PersonSummaryDTO[];
  /** Total you have to pay back, across everyone you owe. */
  toPay: string;
  /** Total others have to pay you. */
  toReceive: string;
  net: string;
  peopleToPay: number;
  peopleToReceive: number;
}

/** Per-person (type -> sum, count, last date) in a single grouped query. */
async function groupedByPerson(userId: string, personId?: string) {
  return prisma.transaction.groupBy({
    by: ["personId", "type"],
    where: { userId, personId: personId ?? { not: null }, type: { in: LEDGER_TYPES } },
    _sum: { amount: true },
    _count: { _all: true },
    _max: { transactionDate: true },
  });
}

export async function getPeopleLedger(userId: string): Promise<PeopleLedger> {
  const [people, groups] = await Promise.all([
    prisma.person.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    groupedByPerson(userId),
  ]);

  const byPerson = new Map<string, typeof groups>();
  for (const g of groups) {
    if (!g.personId) continue;
    const list = byPerson.get(g.personId) ?? [];
    list.push(g);
    byPerson.set(g.personId, list);
  }

  const summaries: PersonSummaryDTO[] = people.map((p) => {
    const rows = byPerson.get(p.id) ?? [];
    const b = personBalance(rows.map((r) => ({ type: r.type, amount: r._sum.amount ?? 0 })));
    const last = rows.reduce<Date | null>((acc, r) => {
      const d = r._max.transactionDate;
      return d && (!acc || d > acc) ? d : acc;
    }, null);
    return {
      ...toPersonDTO(p),
      balance: moneyToString(b.balance),
      gave: moneyToString(b.gave),
      got: moneyToString(b.got),
      entryCount: rows.reduce((n, r) => n + r._count._all, 0),
      lastActivity: last ? toDateOnly(last) : null,
    };
  });

  const totals = ledgerTotals(summaries.map((s) => s.balance));
  return {
    people: summaries,
    toPay: moneyToString(totals.toPay),
    toReceive: moneyToString(totals.toReceive),
    net: moneyToString(totals.net),
    peopleToPay: totals.peopleToPay,
    peopleToReceive: totals.peopleToReceive,
  };
}

/** Just the two headline totals, for the dashboard. */
export async function getLedgerTotals(userId: string): Promise<{ toPay: string; toReceive: string; net: string }> {
  const groups = await groupedByPerson(userId);
  const byPerson = new Map<string, { type: TransactionType; amount: string }[]>();
  for (const g of groups) {
    if (!g.personId) continue;
    const list = byPerson.get(g.personId) ?? [];
    list.push({ type: g.type, amount: moneyToString(g._sum.amount ?? 0) });
    byPerson.set(g.personId, list);
  }
  const totals = ledgerTotals([...byPerson.values()].map((rows) => personBalance(rows).balance));
  return { toPay: moneyToString(totals.toPay), toReceive: moneyToString(totals.toReceive), net: moneyToString(totals.net) };
}

export interface LedgerEntryDTO extends TransactionDTO {
  /** Balance with this person right after this entry (positive: they owe you). */
  runningBalance: string;
}

export interface PersonLedger {
  person: PersonDTO;
  balance: string;
  gave: string;
  got: string;
  /** Newest first. */
  entries: LedgerEntryDTO[];
  /** Old-style loans still on record; deleting the person is blocked while any exist. */
  legacyLoanCount: number;
}

export async function getPersonLedger(userId: string, personId: string): Promise<PersonLedger | null> {
  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!person) return null;
  const [rows, legacyLoanCount] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, personId, type: { in: LEDGER_TYPES } },
      include: transactionInclude,
      orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.loan.count({ where: { userId, personId } }),
  ]);
  const dtos = rows.map(toTransactionDTO);
  const running = withRunningBalance(dtos);
  const b = personBalance(dtos);
  return {
    person: toPersonDTO(person),
    balance: moneyToString(b.balance),
    gave: moneyToString(b.gave),
    got: moneyToString(b.got),
    entries: running.map((e) => ({ ...e, runningBalance: moneyToString(e.runningBalance) })).reverse(),
    legacyLoanCount,
  };
}
