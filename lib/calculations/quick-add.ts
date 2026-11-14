/**
 * Quick add: turns free text like
 *
 *     50 burger
 *     30 auto
 *     45 bus online
 *     120 groceries bob, 15 chai
 *
 * into expense lines. Pure and client-safe so the preview updates on every keystroke.
 *
 * Per line:
 *  - amount: the leading number if the line starts with one, else the last number.
 *    "₹50", "rs 50", "50rs", "50/-", "1,200", "49.50" and "2k" all work.
 *  - account: a payment word anywhere on the line. "cash"/"wallet" mean the cash account,
 *    "online"/"upi"/"bob"/"gpay"/... mean the online (bank) account. One of the user's
 *    own account names also works. Nothing means cash.
 *  - description: whatever is left.
 */
import { toDecimal } from "@/lib/money";

export type QuickAccountRef = { kind: "cash" } | { kind: "online" } | { kind: "account"; accountId: string };

export interface QuickLine {
  /** 0-based position among the parsed entries. */
  index: number;
  /** The entry exactly as typed (trimmed). */
  raw: string;
  /** Normalized amount, e.g. "50.00"; null when no amount was found. */
  amount: string | null;
  description: string;
  account: QuickAccountRef;
  /** The word that picked the account, for display ("bob", "upi"). */
  accountWord: string | null;
  error: string | null;
}

/** Words that mean "paid online", which the user's bank account (Bank of Baroda) handles. */
export const ONLINE_WORDS = ["bob", "baroda", "online", "upi", "gpay", "googlepay", "phonepe", "paytm", "bhim", "net banking", "netbanking"];
export const CASH_WORDS = ["cash", "wallet"];
/** Glue words that only make sense next to a payment word: "via upi", "by cash", "paid online". */
const CONNECTORS = new Set(["via", "by", "through", "thru", "using", "from", "paid", "in", "on", "with"]);

export interface AccountAlias {
  /** Lowercase, single word or phrase. */
  word: string;
  accountId: string;
}

const AMOUNT_TOKEN = /^(?:₹|rs\.?|inr)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(k)?(?:\/-|rs\.?|₹|rupees?)?$/i;

/**
 * Splits text into entries: one per line, and also on ";" or on a comma that is not
 * inside a number ("50 tea, 30 auto" is two entries, "1,200 rent" is one).
 */
export function splitQuickEntries(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n|;|,(?!\d{2,3}(?:\D|$))/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseAmountToken(token: string): string | null {
  const m = token.match(AMOUNT_TOKEN);
  if (!m) return null;
  const [, whole, fraction, k] = m;
  let d = toDecimal(`${whole.replace(/,/g, "")}${fraction ? `.${fraction}` : ""}`);
  if (k) d = d.times(1000);
  if (!d.greaterThan(0)) return null;
  return d.toFixed(2);
}

/** "₹ 50" / "rs 50" / "50 rs" -> single tokens, so amounts never straddle two words. */
function tokenize(entry: string): string[] {
  return entry
    .replace(/(₹|\brs\.?|\binr)\s+(?=\d)/gi, "$1")
    .replace(/(\d)\s+(rs\.?|rupees?|\/-)(?=\s|$)/gi, "$1$2")
    .split(/\s+/)
    .filter(Boolean);
}

function cleanDescription(words: string[]): string {
  return words
    .join(" ")
    .replace(/^[\s\-–—:=@.,]+|[\s\-–—:=@.,]+$/g, "")
    .replace(/^(for|on)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseQuickEntry(raw: string, index: number, aliases: readonly AccountAlias[] = []): QuickLine {
  const tokens = tokenize(raw);
  const lower = tokens.map((t) => t.toLowerCase().replace(/[.,!]+$/, ""));

  // Amount: leading number wins, else the last number on the line.
  let amountAt = -1;
  let amount: string | null = null;
  const first = tokens.length ? parseAmountToken(tokens[0]) : null;
  if (first) {
    amount = first;
    amountAt = 0;
  } else {
    for (let i = tokens.length - 1; i >= 0; i--) {
      const a = parseAmountToken(tokens[i]);
      if (a) {
        amount = a;
        amountAt = i;
        break;
      }
    }
  }

  // Account: the last payment word on the line. Two-word words ("net banking") first.
  let account: QuickAccountRef = { kind: "cash" };
  let accountWord: string | null = null;
  const used = new Set<number>(amountAt >= 0 ? [amountAt] : []);
  const matchWord = (i: number): { ref: QuickAccountRef; span: number; word: string } | null => {
    const two = i + 1 < lower.length ? `${lower[i]} ${lower[i + 1]}` : null;
    const aliasTwo = two ? aliases.find((a) => a.word === two) : undefined;
    if (aliasTwo) return { ref: { kind: "account", accountId: aliasTwo.accountId }, span: 2, word: two! };
    if (two && ONLINE_WORDS.includes(two)) return { ref: { kind: "online" }, span: 2, word: two };
    const w = lower[i];
    const alias = aliases.find((a) => a.word === w);
    if (alias) return { ref: { kind: "account", accountId: alias.accountId }, span: 1, word: w };
    if (ONLINE_WORDS.includes(w)) return { ref: { kind: "online" }, span: 1, word: w };
    if (CASH_WORDS.includes(w)) return { ref: { kind: "cash" }, span: 1, word: w };
    return null;
  };
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (used.has(i)) continue;
    const hit = matchWord(i);
    if (!hit) continue;
    account = hit.ref;
    accountWord = hit.word;
    for (let j = i; j < i + hit.span; j++) used.add(j);
    // Drop "via" / "by" / "paid" right before the payment word.
    let k = i - 1;
    while (k >= 0 && !used.has(k) && CONNECTORS.has(lower[k])) used.add(k--);
    break;
  }

  const description = cleanDescription(tokens.filter((_, i) => !used.has(i)));
  return {
    index,
    raw,
    amount,
    description,
    account,
    accountWord,
    error: amount ? null : "No amount found",
  };
}

export function parseQuickText(text: string, aliases: readonly AccountAlias[] = []): QuickLine[] {
  return splitQuickEntries(text).map((entry, i) => parseQuickEntry(entry, i, aliases));
}

/** Account words that are too generic to stand for one account on their own. */
const GENERIC_ACCOUNT_WORDS = new Set([
  "self", "brother", "bank", "account", "acc", "a/c", "my", "main", "savings", "saving", "current", "card", "the", "and",
  ...CASH_WORDS,
  ...ONLINE_WORDS,
]);

/**
 * Words that point at one specific account: its full name ("hdfc bank" / "hdfcbank"),
 * its institution, and any distinctive word in its name that no other account shares.
 * The built-in online/cash words are never overridden.
 */
export function buildAccountAliases(accounts: readonly { id: string; name: string; institution: string | null }[]): AccountAlias[] {
  const candidates = new Map<string, Set<string>>();
  const add = (word: string, id: string) => {
    const w = word.trim().toLowerCase();
    if (w.length < 3 || GENERIC_ACCOUNT_WORDS.has(w)) return;
    const set = candidates.get(w) ?? new Set<string>();
    set.add(id);
    candidates.set(w, set);
  };
  for (const a of accounts) {
    const name = a.name.toLowerCase();
    add(name, a.id);
    add(name.replace(/\s+/g, ""), a.id);
    for (const w of name.split(/\s+/)) add(w, a.id);
    if (a.institution) {
      add(a.institution, a.id);
      for (const w of a.institution.toLowerCase().split(/\s+/)) add(w, a.id);
    }
  }
  const aliases: AccountAlias[] = [];
  for (const [word, ids] of candidates) if (ids.size === 1) aliases.push({ word, accountId: [...ids][0] });
  return aliases;
}
