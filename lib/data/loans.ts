import "server-only";
import { prisma } from "@/lib/prisma";
import { summarizeLoans, summarizeLoansByPerson } from "@/lib/calculations/loans";
import { toLoanDTO, toPersonDTO, toTransactionDTO, transactionInclude } from "@/lib/serialize";
import { moneyToString } from "@/lib/money";
import type { LoanDTO, PersonDTO, TransactionDTO } from "@/lib/types";
import type { LoanDirection, LoanStatus } from "@/generated/prisma/enums";

const loanInclude = { person: { select: { name: true } } } as const;

export async function getLoans(
  userId: string,
  opts: { status?: LoanStatus | "ALL"; personId?: string; direction?: LoanDirection } = {},
): Promise<LoanDTO[]> {
  const rows = await prisma.loan.findMany({
    where: {
      userId,
      ...(opts.status && opts.status !== "ALL" ? { status: opts.status } : {}),
      ...(opts.personId ? { personId: opts.personId } : {}),
      ...(opts.direction ? { direction: opts.direction } : {}),
    },
    include: loanInclude,
    orderBy: [{ status: "asc" }, { startDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toLoanDTO);
}

export async function getLoanById(userId: string, id: string): Promise<LoanDTO | null> {
  const row = await prisma.loan.findFirst({ where: { id, userId }, include: loanInclude });
  return row ? toLoanDTO(row) : null;
}

export interface PersonLoanSummaryDTO {
  personId: string;
  personName: string;
  youOwe: string;
  owedToYou: string;
  net: string;
  activeLoans: number;
}

export interface LoanOverview {
  youOwe: string;
  owedToYou: string;
  net: string;
  /** People you owe money to (youOwe > 0). */
  youOwePeople: PersonLoanSummaryDTO[];
  /** People who owe you money (owedToYou > 0). */
  owedToYouPeople: PersonLoanSummaryDTO[];
  activeLoans: LoanDTO[];
}

export async function getLoanOverview(userId: string): Promise<LoanOverview> {
  const rows = await prisma.loan.findMany({
    where: { userId, status: "ACTIVE" },
    include: loanInclude,
    orderBy: [{ startDate: "desc" }],
  });
  const totals = summarizeLoans(rows);
  const perPerson = summarizeLoansByPerson(
    rows.map((l) => ({
      direction: l.direction,
      outstandingAmount: l.outstandingAmount,
      personId: l.personId,
      personName: l.person.name,
    })),
  );
  const serialize = (p: (typeof perPerson)[number]): PersonLoanSummaryDTO => ({
    personId: p.personId,
    personName: p.personName,
    youOwe: moneyToString(p.youOwe),
    owedToYou: moneyToString(p.owedToYou),
    net: moneyToString(p.net),
    activeLoans: p.activeLoans,
  });
  return {
    youOwe: moneyToString(totals.youOwe),
    owedToYou: moneyToString(totals.owedToYou),
    net: moneyToString(totals.net),
    youOwePeople: perPerson.filter((p) => p.youOwe.greaterThan(0)).map(serialize),
    owedToYouPeople: perPerson.filter((p) => p.owedToYou.greaterThan(0)).map(serialize),
    activeLoans: rows.map(toLoanDTO),
  };
}

export interface PersonLoanDetail {
  person: PersonDTO;
  loans: LoanDTO[];
  transactions: TransactionDTO[];
  youOwe: string;
  owedToYou: string;
  net: string;
}

export async function getPersonLoanDetail(userId: string, personId: string): Promise<PersonLoanDetail | null> {
  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  if (!person) return null;
  const [loans, transactions] = await Promise.all([
    prisma.loan.findMany({
      where: { userId, personId },
      include: loanInclude,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    }),
    prisma.transaction.findMany({
      where: { userId, loan: { personId } },
      include: transactionInclude,
      orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const totals = summarizeLoans(loans);
  return {
    person: toPersonDTO(person),
    loans: loans.map(toLoanDTO),
    transactions: transactions.map(toTransactionDTO),
    youOwe: moneyToString(totals.youOwe),
    owedToYou: moneyToString(totals.owedToYou),
    net: moneyToString(totals.net),
  };
}
