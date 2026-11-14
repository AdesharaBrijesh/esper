import "server-only";
import { generateJson, type GeminiPart, type GeminiSchema } from "@/lib/ai/gemini";
import { TRADING_KINDS, type AiBankRow, type AiTradingRow } from "@/lib/calculations/ai-statement";
import type { DateOnly } from "@/lib/dates";

/** A file handed to the model as-is (PDF or image), or text we already extracted (spreadsheet). */
export type AiSource = { kind: "file"; mimeType: string; data: Buffer; name: string } | { kind: "text"; text: string; name: string };

function toParts(sources: readonly AiSource[]): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const s of sources) {
    parts.push({ text: `File: ${s.name}` });
    if (s.kind === "file") parts.push({ inlineData: { mimeType: s.mimeType, data: s.data.toString("base64") } });
    else parts.push({ text: s.text });
  }
  return parts;
}

const BANK_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", description: "YYYY-MM-DD" },
          description: { type: "STRING" },
          amount: { type: "NUMBER", description: "Positive, exactly as printed" },
          direction: { type: "STRING", enum: ["debit", "credit"] },
          category: { type: "STRING", description: "One of the given category names, or empty" },
        },
        required: ["date", "description", "amount", "direction", "category"],
        propertyOrdering: ["date", "description", "amount", "direction", "category"],
      },
    },
    note: { type: "STRING", description: "Short remark if something could not be read; else empty" },
  },
  required: ["rows", "note"],
  propertyOrdering: ["rows", "note"],
};

function bankSystem(today: DateOnly, expenseNames: string[], incomeNames: string[]) {
  return `You extract money transactions for a personal finance app in India.
Inputs can be bank statements (PDF or spreadsheet), passbook photos, or screenshots of UPI apps (Google Pay, PhonePe, Paytm, BHIM) and bank apps.

Today is ${today}.

Return every individual transaction exactly once:
- date: YYYY-MM-DD. Indian statements are day-first (01/09/2026 is 1 September). If only day and month are shown, use the year that keeps the date on or before today.
- amount: a positive number exactly as printed. Do not round and do not include currency symbols or separators.
- direction: "debit" when money left the account (withdrawal, Dr, "paid to", "sent", a minus sign), "credit" when money came in (deposit, Cr, "received from", a plus sign).
- description: just the merchant or person name, short (under 80 characters), e.g. "Swiggy", "Rahul Sharma", "Apollo Pharmacy". Leave out "Paid to", "Received from", "UPI/", long reference numbers and UPI IDs when a readable name exists.
- category: the best match from the list for that direction, or "" when unsure.
  Expense categories: ${expenseNames.join(", ") || "(none)"}
  Income categories: ${incomeNames.join(", ") || "(none)"}

Do not include: opening or closing balances, totals, balance-only lines, failed, pending, declined or reversed-and-cancelled attempts, or the same transaction twice when screenshots overlap.
If the input is not a statement or list of transactions, return no rows and say why in note.`;
}

export async function extractBankRows(
  sources: readonly AiSource[],
  opts: { today: DateOnly; expenseCategories: string[]; incomeCategories: string[] },
): Promise<{ rows: AiBankRow[]; note: string }> {
  const out = await generateJson<{ rows?: AiBankRow[]; note?: string }>({
    system: bankSystem(opts.today, opts.expenseCategories, opts.incomeCategories),
    parts: [...toParts(sources), { text: "Extract the transactions." }],
    schema: BANK_SCHEMA,
  });
  return { rows: Array.isArray(out.rows) ? out.rows : [], note: typeof out.note === "string" ? out.note : "" };
}

const TRADING_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    rows: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING", description: "YYYY-MM-DD" },
          kind: { type: "STRING", enum: [...TRADING_KINDS] },
          amount: { type: "NUMBER", description: "Positive" },
          description: { type: "STRING" },
        },
        required: ["date", "kind", "amount", "description"],
        propertyOrdering: ["date", "kind", "amount", "description"],
      },
    },
    note: { type: "STRING", description: "Short remark (e.g. whether P&L was already net of charges); else empty" },
  },
  required: ["rows", "note"],
  propertyOrdering: ["rows", "note"],
};

function tradingSystem(today: DateOnly) {
  return `You read stock broker reports from Angel One (Angel Broking) for a personal finance app in India: P&L statements, tradebooks, contract notes, ledger / funds statements, and app screenshots.

Today is ${today}.

The app tracks a trading account with only these entry kinds. Convert the report into them:
- profit: a realised gain. One row per scrip per sell (or squared-off) date when the report shows dates; otherwise one row per scrip dated at the last sell date or the statement end date.
- loss: a realised loss, same granularity as profit.
- charges: brokerage plus taxes and fees (STT, exchange transaction charges, GST, SEBI fees, stamp duty, DP charges, AMC, call and trade). One row per date when charges are shown per date, else a single row dated at the statement end date. If the profit and loss figures are already net of charges, do not add charges rows and say so in note.
- deposit: money added to Angel One from a bank ("Funds added", "Pay-in", "Bank receipt").
- withdrawal: money sent from Angel One to a bank ("Payout", "Withdrawal").

Rules:
- date: YYYY-MM-DD. Indian reports are day-first.
- amount: always positive. The kind carries the direction.
- description: the instrument and segment, e.g. "RELIANCE (Equity delivery)", "NIFTY 24500 CE (F&O)", "TATAMOTORS (Intraday)"; for charges "Charges"; for funds "Funds added" or "Funds withdrawn".
- Dividends credited to the trading ledger are profit rows described as "Dividend – <scrip>".

Never include: unrealised or notional P&L, open positions, holdings or portfolio value, individual buy or sell legs, turnover, margin blocked or released, opening or closing balances, or summary totals that repeat rows you already listed.
If the input is not a broker report, return no rows and say why in note.`;
}

export async function extractTradingRows(
  sources: readonly AiSource[],
  opts: { today: DateOnly },
): Promise<{ rows: AiTradingRow[]; note: string }> {
  const out = await generateJson<{ rows?: AiTradingRow[]; note?: string }>({
    system: tradingSystem(opts.today),
    parts: [...toParts(sources), { text: "Extract the entries." }],
    schema: TRADING_SCHEMA,
  });
  return { rows: Array.isArray(out.rows) ? out.rows : [], note: typeof out.note === "string" ? out.note : "" };
}
