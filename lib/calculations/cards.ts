import { toDecimal, ZERO, type Decimal, type MoneyInput } from "@/lib/money";
import { addMonths, toDateOnly, type DateOnly } from "@/lib/dates";
import { CARD_UTILISATION_DANGER, CARD_UTILISATION_WARN } from "@/lib/constants";

/**
 * Credit card maths.
 *
 * A card is an ordinary account in the ledger — the existing rule
 * `balance = opening + in - out` already does the right thing. Swiping the card is an
 * expense from it, which pushes the balance negative; that negative number *is* the
 * amount owed. Paying the bill is a transfer from a bank account into the card, which
 * moves the balance back toward zero. Nothing here needs a special transaction type.
 */

export interface CardLike {
  balance: MoneyInput;
  creditLimit?: MoneyInput | null;
  statementDay?: number | null;
  dueDay?: number | null;
}

export type UtilisationLevel = "none" | "healthy" | "warn" | "danger";

export interface CardSummary {
  /** Amount owed, never negative. A card in credit (overpaid) reports 0. */
  outstanding: Decimal;
  /** Positive when the card has been overpaid. */
  creditBalance: Decimal;
  limit: Decimal | null;
  available: Decimal | null;
  /** 0-100, or null when no limit has been set. */
  utilisation: number | null;
  level: UtilisationLevel;
}

export function cardSummary(card: CardLike): CardSummary {
  const balance = toDecimal(card.balance);
  // Negative balance = money owed. Positive = the card is in credit.
  const outstanding = balance.isNegative() ? balance.negated() : ZERO;
  const creditBalance = balance.greaterThan(0) ? balance : ZERO;

  const limitRaw = card.creditLimit === null || card.creditLimit === undefined ? null : toDecimal(card.creditLimit);
  const limit = limitRaw && limitRaw.greaterThan(0) ? limitRaw : null;

  if (!limit) {
    return { outstanding, creditBalance, limit: null, available: null, utilisation: null, level: "none" };
  }

  const available = limit.minus(outstanding);
  const utilisation = Math.max(0, Math.round(outstanding.dividedBy(limit).times(100).toNumber()));
  const level: UtilisationLevel =
    utilisation >= CARD_UTILISATION_DANGER ? "danger" : utilisation >= CARD_UTILISATION_WARN ? "warn" : "healthy";

  return { outstanding, creditBalance, limit, available, utilisation, level };
}

/** Clamps a day-of-month to a month that does not have it (the 31st of February). */
function dayInMonth(year: number, monthIndex: number, day: number): DateOnly {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return toDateOnly(new Date(Date.UTC(year, monthIndex, Math.min(Math.max(1, day), lastDay))));
}

/**
 * The next time this card's bill is due, given a day-of-month setting.
 * Returns null when the card has no due day configured.
 */
export function nextDueDate(dueDay: number | null | undefined, today: DateOnly): DateOnly | null {
  if (!dueDay || dueDay < 1 || dueDay > 31) return null;
  const [y, m] = today.split("-").map(Number);
  const thisMonth = dayInMonth(y, m - 1, dueDay);
  if (thisMonth >= today) return thisMonth;
  const next = addMonths(`${today.slice(0, 7)}-01`, 1);
  const [ny, nm] = next.split("-").map(Number);
  return dayInMonth(ny, nm - 1, dueDay);
}

/** The statement date the current cycle closes on. */
export function nextStatementDate(statementDay: number | null | undefined, today: DateOnly): DateOnly | null {
  return nextDueDate(statementDay, today);
}

export interface CardTotals {
  outstanding: Decimal;
  limit: Decimal;
  available: Decimal;
  /** Across every card with a limit set. */
  utilisation: number | null;
  cards: number;
}

/** Rolls several cards into the single figure shown on the dashboard. */
export function totalCardPosition(cards: readonly CardLike[]): CardTotals {
  let outstanding = ZERO;
  let limit = ZERO;
  for (const card of cards) {
    const summary = cardSummary(card);
    outstanding = outstanding.plus(summary.outstanding);
    if (summary.limit) limit = limit.plus(summary.limit);
  }
  const utilisation = limit.greaterThan(0)
    ? Math.max(0, Math.round(outstanding.dividedBy(limit).times(100).toNumber()))
    : null;
  return { outstanding, limit, available: limit.minus(outstanding), utilisation, cards: cards.length };
}
