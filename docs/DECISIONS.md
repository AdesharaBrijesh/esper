# Design decisions

Why Esper is built the way it is. Each entry records the choice, the reasons, and what
was rejected, so later changes can be made knowingly. Newest first.

---

## 2026-11-15 · Prisma-compatible migrations over `pg`, and the Neon SQL Editor fallback

**Context.** Shipping the people ledger needed two migrations on the live Neon database.
`prisma migrate deploy` failed with `P1001: Can't reach database server` from the
development machine, even while the live app connected fine. Diagnosis: that network
blocks the Postgres protocol on port 5432 (the TLS handshake gets no reply, while HTTPS to
the same Neon host on 443 works). Vercel's build machines are unaffected.

**Decision.**
- Added `scripts/apply-migrations.ts` (`npm run db:deploy:pg`): applies pending migrations
  with the app's own `pg` driver and writes `_prisma_migrations` exactly as Prisma does (one
  row per migration, SHA-256 checksum of `migration.sql`). Preview by default, `--apply` to
  write, one transaction per migration, refuses on a failed or modified earlier migration.
  Verified on a scratch database: afterwards `prisma migrate status` reports up to date and
  `prisma migrate diff` against `schema.prisma` is empty.
- When port 5432 is blocked entirely, the same migration is run as SQL in the **Neon SQL
  Editor** (HTTPS), including the `_prisma_migrations` rows, in one transaction that refuses
  to run twice. That is how `20261114172412_people_ledger` and
  `20261114172500_backfill_transaction_person` reached production.

**Rejected.** Tunnelling Postgres over WebSockets (`@neondatabase/serverless`) to get past
the network block: it works around a network control rather than through a supported
channel. Running migrations inside the Vercel build is still an option for later (it
guarantees "schema before code"), but it changes how every deploy behaves, so it was left as
an explicit future choice.

**Rule kept.** Migrations stay additive whenever possible, so the database can be migrated
before the new code ships and the old code keeps working in between.

---

## 2026-11-15 · People ledger instead of per-loan bookkeeping

**Context.** The old "People & Loans" screen modelled each borrow/lend as a `Loan` with its
own outstanding balance, and repayments had to be linked to a specific loan. What's needed
in practice is simpler: per friend, "they gave me / I gave them", and how much is owed either
way, plus the total owed to everyone.

**Decision.**
- Two transaction types, `GAVE` (money from you to them) and `GOT` (them to you), and a
  `Transaction.personId` column. A person's balance is simply
  `sum(GAVE) − sum(GOT)`: positive means they owe you, negative means you owe them.
- Totals net each person first, then add up: a friend you lent ₹500 and borrowed ₹200 from
  counts once, as ₹300 owed to you. "You need to pay" is the sum of every negative balance.
- The account is **optional** on these entries. With an account, the money really moves
  (cash goes down when you hand a friend cash). Without one it's only a record: useful for
  "he paid my share of the rent" or writing down an old debt without pretending money left
  an account today.
- A balance is a plain sum, so editing or deleting any entry is always safe. There is no
  per-loan outstanding amount to keep in sync.

**Existing data was kept, not converted.** The old loan types (`BORROW`, `LEND`,
`LOAN_REPAYMENT`, `LENT_REPAYMENT`) stay valid and count in the same balance through
`PERSON_BALANCE_SIGN` (lend and repaying a loan raise it; borrow and receiving a repayment
lower it). An additive migration only fills `personId` on existing loan transactions. A
conversion that rewrote those rows into `GAVE`/`GOT` and deleted the `Loan` table rows was
considered and rejected: irreversible changes to production data for no functional gain.
New entries are never created as the old types (the form hides them; existing ones stay
editable). `/loans` permanently redirects to `/people`.

**Deleting a person** removes their `GAVE`/`GOT` entries in the same database transaction
(after a confirmation that says how many), which also reverses whatever those entries did to
account balances. It is blocked while old-style loans exist, since those carry their own
repayment links.

---

## 2026-11-15 · Quick add parses on the client, categorises without AI

**Decision.** `lib/calculations/quick-add.ts` is pure and runs in the browser, so the
preview updates on every keystroke and works without a network round trip.

- **Entries**: one per line; also split on `;` and on a comma that isn't inside a number
  (`50 tea, 30 auto` is two entries, `1,200 rent` is one).
- **Amount**: the leading number if the line starts with one, else the last number. The
  leading-number rule keeps quantities as text (`60 2 samosa` is ₹60 for "2 samosa").
  Accepts `₹50`, `rs 50`, `50rs`, `50/-`, `1,200`, `49.5`, `2k`. A line without an amount is
  flagged and skipped, never guessed.
- **Account**: cash by default. `bob`, `baroda`, `online`, `upi`, `gpay`, `phonepe`, `paytm`,
  `bhim`, `net banking` mean the "online" account (default: the account named or
  institution-tagged Bank of Baroda, else the first bank account), paid as **UPI**, because
  day-to-day spends from the bank go out over UPI, not as bank transfers. `cash`/`wallet`
  force cash. A distinctive word from one of your own account names (`hdfc`, `icici`) picks
  that account. Connector words before a payment word (`via upi`, `by cash`) are dropped.
  Both default accounts can be changed on the page and are remembered per device.
- **Category**, strongest evidence first: (1) what you filed the exact same description under
  before; (2) the longest matching keyword in the built-in dictionary; (3) a single word you
  have consistently (≥ 2 times, ≥ 80%) filed under one category; (4) Miscellaneous. Keywords
  match at word starts, and keywords of 4 letters or fewer must also end on a word boundary,
  so `bus` never fires inside "business" and `tea` never inside "team". Longest match wins,
  so "water bill" is Bills and "uber eats" is Food.

**Rejected.** Sending every quick-add line to an AI: slower, costs quota, and the rules plus
learned history are already right for short everyday descriptions. When nothing matches,
Miscellaneous (editable) is the agreed fallback.

---

## 2026-11-15 · Import: exact parsers first, Gemini for what they can't read

**Decision.**
- **CSV and Excel** are parsed deterministically (exact amounts, no quota). The header row is
  searched for in the first 40 rows, because bank exports (Bank of Baroda among them) put
  account details above it. Excel is read with `read-excel-file` (pinned to an exact,
  two-weeks-old release; the `xlsx` package on npm is unmaintained). Old `.xls` files are
  rejected with a "save as .xlsx or CSV" message.
- **Photos, UPI screenshots and PDFs** go to Gemini when AI reading is on (default when
  `GEMINI_API_KEY` is set). With it off, text PDFs still use the line heuristics from the
  original importer. Password-protected PDFs are detected and rejected with instructions,
  since neither path can open them.
- **Angel One mode** always uses Gemini: every broker report is laid out differently. The
  prompt maps reports onto the five trading entry kinds the ledger already has: `profit` and
  `loss` (realised, per scrip per sell date), `charges` (brokerage, STT, GST, exchange,
  SEBI, stamp duty, DP; skipped if the P&L is already net of charges), `deposit` and
  `withdrawal` (funds moved between bank and Angel One). Unrealised P&L, holdings, turnover
  and individual buy/sell legs are excluded. These become `TRADING_PROFIT`,
  `TRADING_LOSS`, `TRADING_DEPOSIT` and `TRADING_WITHDRAWAL` transactions.
- **AI output is untrusted input.** `lib/calculations/ai-statement.ts` validates every row
  (real date, positive amount, known direction or kind) and reports the rest as skipped with
  a reason, the same contract as the CSV/PDF parsers. A date more than a day in the future
  is moved back a year (screenshots often omit the year). Nothing is written until the user
  reviews the rows; date, description, amount and category/kind are all editable, and
  likely duplicates (same date, amount and direction in that account) are unticked by
  default.
- **Category for imported rows**: your own history and exact keyword matches beat the AI's
  suggestion; the AI's suggestion beats the blind Miscellaneous fallback.
- **Uploads** go through a server action limited to 4.5 MB (Vercel's request cap); photos are
  resized in the browser (long side 2000 px, JPEG) before upload. The import page sets
  `maxDuration = 150` because a multi-page statement can take a while.

**Gemini client** (`lib/ai/gemini.ts`): plain `fetch` to the REST API (no SDK), JSON output
constrained by a response schema, temperature 0. Models are tried in order
(`GEMINI_MODEL` overrides): `gemini-flash-lite-latest` first, then `gemini-flash-latest`.
Measured on real tests, lite was as accurate on these extraction tasks and answered in
about 2 s, while flash-latest often sat on "high demand" for close to a minute before
failing. A model that answers "busy" (429/503) is retried twice after short pauses before
moving on, all inside a 125 s budget. `gemini-2.5-flash` is retired and not used.

**Rejected.** AI for CSV/Excel (exact parsing is better and free); a separate broker
integration or API (Angel One's official APIs need trading credentials, and a monthly
report upload is all that's needed).

---

## Earlier decisions (summarised)

- **Money is `DECIMAL(14,2)`** in PostgreSQL and `decimal.js` in code; no floats touch
  money. Balances are always derived from opening balance plus transactions, never stored.
- **Five kinds of money movement never mix**: expense/income, transfer, trading result,
  people (gave/got), investment contribution. Only expense and income appear in spending
  reports.
- **Plans don't auto-post**: paying an instalment is deliberate, so a bounced payment never
  shows as paid.
- **Hosting moved to Vercel + Neon** (2026-09) after the homeserver proved unreliable;
  Docker self-hosting still works unchanged.
