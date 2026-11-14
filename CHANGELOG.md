# Changelog

All notable changes to this project are documented here.

## 2026-11-15 — People ledger, quick add, smart import

Why each piece works the way it does is recorded in [docs/DECISIONS.md](docs/DECISIONS.md).

### Added

- **People ledger** (`/people`, replaces "People & Loans"): one running balance per friend.
  "You gave" / "You got" entries, each optionally through an account (no account = just a
  record, no account balance moves). Shows who you owe and who owes you, **the total you need
  to pay everyone** and the total you'll get back (each person netted first), a running
  balance on every entry, and a one-tap "Settle up" with the exact amount.
  New `GAVE` / `GOT` transaction types and `Transaction.personId`.
- **Quick add** (`/transactions/quick`, the "Quick list" tab on the Add screen, and a dashboard
  button): type a whole day of spends, one per line (`50 burger`, `30 auto`, `45 bus online`),
  with a live preview. Amounts in any common form (`₹50`, `50rs`, `1,200`, `2k`); categories from
  a word-aware keyword dictionary plus what you filed the same words under before, else
  Miscellaneous. Paid from cash by default; `bob` / `online` / `upi` (and gpay, phonepe, …) pay
  from the Bank of Baroda account by UPI; any of your own account names works too. Every
  category and account chip is editable before adding; the draft survives leaving the page;
  Ctrl+Enter adds.
- **Smarter import** (`/transactions/import`):
  - Excel (.xlsx) statements, and header rows found below a bank's preamble (CSV too).
  - UPI app screenshots, photos and scanned PDFs read by Gemini (free tier,
    `GEMINI_API_KEY`); several files per upload; photos compressed in the browser.
  - **Angel One** mode: P&L statements, tradebooks, ledgers and screenshots become trading
    profit / loss / charges / funds added / withdrawn entries in your trading account, with
    fund movements tied to the bank account you choose.
  - Every row is validated, then editable (date, description, amount, category or kind);
    likely duplicates are flagged and unticked; password-protected PDFs are detected with
    instructions.
- **`scripts/apply-migrations.ts`** (`npm run db:deploy:pg`): applies Prisma migrations through
  the app's own `pg` driver with Prisma-identical bookkeeping, for machines where
  `prisma migrate deploy` can't connect. Preview by default, `--apply` to write.
- `docs/DECISIONS.md`: the design record for these features.

### Changed

- Category suggestions (imports and quick add) match on word boundaries and prefer the longest
  keyword, learn from your own past categorisation, and know many more everyday spends (chai,
  vada pav, auto, petrol, medicines, …).
- Dashboard and Reports show "To pay" / "To get" from the people ledger; the export
  `/api/export/people` (old `/api/export/loans` still works) lists each person's balance.
- Navigation: "People & Loans" is now "People"; Quick add and the Add form count as the Add
  button, not Activity.
- Existing loan transactions are untouched and count in the same people balances; the
  transaction form no longer offers the old loan types for new entries. `/loans` and
  `/loans/:id` permanently redirect to `/people`.

### Database

- `20261114172412_people_ledger`: `GAVE`/`GOT` enum values, `Transaction.personId` (+ index,
  foreign key). Additive.
- `20261114172500_backfill_transaction_person`: fills `personId` on existing loan transactions
  from their loan. Changes nothing else.
- Applied to production on 2026-11-15 through the Neon SQL Editor (the development network
  blocks Postgres on port 5432); see docs/DECISIONS.md.

### Configuration

- New optional env vars: `GEMINI_API_KEY` (set on Vercel for Production and Preview) and
  `GEMINI_MODEL` (comma-separated models; default `gemini-flash-lite-latest,gemini-flash-latest`).
- Server-action uploads raised to 4.5 MB (`experimental.serverActions.bodySizeLimit`).
- New dependency: `read-excel-file` 9.3.14 (pinned).

### Tests

- Unit: quick-add parsing and account words, word-boundary and learned categorisation,
  ledger maths and running balances, AI row validation, header detection, Excel cells
  (172 unit tests in total).
- Integration: people ledger against PostgreSQL: gave/got with and without accounts, new
  person by name, legacy loans counted, totals across people, edits, trading mappings
  (41 integration tests in total).
- Verified end to end in a browser against the real server and Gemini: screenshot import,
  Angel One import, quick add and a ledger entry.

## 2026-09-19 — Bank statement import, Vercel + Neon

### Added

- **Bank statement import**: upload a CSV or PDF statement (`/transactions/import`), get every row
  auto-categorised against your own categories (free, rule-based keyword matching — no API key, no
  AI cost), review and fix any row on screen, then approve to create the transactions in one go.
  - CSV: tolerant of common column-name variants (Debit/Credit pair, or a single signed/typed
    Amount column) and several date formats.
  - PDF: text-based extraction (genuine bank PDFs only, not scanned images). Two heuristics, in
    order of confidence — an explicit Dr/Cr marker next to an amount, or a running-balance delta
    when no marker exists. Skips any line it can't confidently read rather than guess a direction.
  - Duplicate detection: rows matching an existing transaction on this account (same date +
    amount) are flagged and excluded by default, so re-uploading an overlapping statement doesn't
    double-count.
  - Only creates expenses and income — a statement alone can't tell transfers, loans or trading
    apart, so those still go through the normal add-transaction flow.
  - 24 unit tests covering CSV column variants, date formats, the PDF heuristics, and
    categorisation, plus a full service-level smoke test (parse → categorise → create → duplicate
    check → cleanup) against a real database.

### Fixed

- Native `<select>` dropdown options were unreadable (very low contrast) in dark mode — Chromium's
  option/optgroup popup mostly ignores page CSS and `color-scheme` alone isn't enough against a
  custom theme. Set `background-color`/`color` on `select`, `option` and `optgroup` directly, which
  Chromium does honour.

### Hosting

- Moved the live deployment from a self-hosted homeserver (unreliable power) to Vercel + Neon,
  both free tiers, no code changes needed for the database swap. See README → "Hosting".
- Fixed `output: "standalone"` breaking Vercel's own build tracing — it's now conditional on
  `process.env.VERCEL`, so the self-hosted Docker path keeps its standalone output unchanged.
- Removed the SSH-based `deploy` job from CI (it targeted the now-retired homeserver); `check` and
  `integration` remain as pure quality gates. `scripts/deploy.sh` is untouched for anyone who wants
  to wire the same job up against their own Docker host.
- Added a second, fully isolated user account for a friend, seeded with the same default categories
  and starter accounts as the primary user — the data model already scoped every record by
  `userId`, so this needed no schema or code changes, just a one-off seed.

## v1 preparation

### Added

**Plans — the recurring side of money**
- Recurring commitments of every kind in one model: course fees (school, college, bachelor's, master's), subscriptions, rent and utility bills, EMIs and SIPs.
- A plan generates its whole schedule at once, **past terms included**, so several years of fees can be entered in one screen instead of one form at a time.
- Bulk "mark paid" for backfilling, dating each instalment on **its own due date** so old terms land in the right months in reports rather than piling onto today.
- Paying an instalment writes an ordinary transaction, so balances, reports and CSV exports need no special cases. Undoing a payment deletes that transaction; deleting the transaction from the Activity screen returns the instalment to pending.
- Instalments can be re-priced, skipped (a waived term, a paused subscription) or undone. Editing a plan re-prices only what is unpaid — it never rewrites paid history.
- Fixed-length plans close themselves when nothing is pending; open-ended ones schedule a rolling year ahead and extend on demand.
- "Coming up" on the dashboard, with overdue instalments called out.

**Credit cards**
- Outstanding balance, credit limit, utilisation with healthy/warn/danger levels, spend this month, and the next bill due date.
- A card stays an ordinary account whose negative balance is the amount owed, so it can never disagree with the ledger. Spending is an expense; paying the bill is a transfer, pre-filled from the card screen.

**Investments**
- Investment accounts with contributions tracked as transfers, and worth recorded as dated valuation snapshots. Gain, return percentage and portfolio totals derive from those — no price feed, no API key, nothing that can break or start charging.
- Holdings without a valuation are shown at cost rather than zero.
- SIP plans fund an investment account directly.

**Other**
- CSV export of plans.
- `npm run reset-password` — the recovery path for a self-hosted app with no email reset.

### Security

- Login is rate-limited on client IP **and** submitted email with an escalating lockout (5 failures → 1 minute, doubling to a 30-minute cap). The email key matters because forwarded IP headers are spoofable unless a trusted proxy sets them. Password change is limited the same way, so a stolen session is not an oracle for the existing password.
- A failed login always spends one bcrypt comparison, even when no user matches, so timing no longer reveals which emails exist.
- Nonce-based Content Security Policy issued per request from `proxy.ts`, plus frame denial, nosniff, referrer, permissions, COOP and HSTS headers. `style-src` keeps `'unsafe-inline'` deliberately: Base UI and Recharts position through inline style attributes a nonce cannot cover.
- The environment is validated at boot; production refuses to start on a missing, short or placeholder `AUTH_SECRET` instead of failing on the first request that needs it.
- The app is `noindex` and ships a `robots.txt` disallowing everything.

### Operations

- GitHub Actions CI: typecheck, lint, unit tests and build, plus the integration suite against a PostgreSQL service container.
- The integration runner used to exit 0 when `TEST_DATABASE_URL` was unset, so "tests passed" could mean the suite never ran. It now fails in CI.
- Backups are verified before being trusted. The dump was previously redirected straight into the final file, which creates it before `pg_dump` runs and leaves a truncated archive looking exactly like a good one; it now writes to a temp file, checks the gzip, the size and the `pg_dump` header, then moves it into place.
- Container logs are capped, so unbounded `json-file` logs cannot fill the server's disk.
- Continuous deployment: a `deploy` job in CI redeploys to the homeserver automatically after every push to `main` that passes the other jobs, over SSH via an ephemeral Tailscale-joined runner and a key restricted to one forced command (`scripts/deploy.sh`). See README → "Continuous deployment".
- `docker-compose.override.yml` is now the documented, gitignored place for site-specific Compose tweaks (e.g. attaching to an existing reverse-proxy network), so `deploy.sh`'s `git reset --hard` can never clobber a server's local configuration.
- First live deployment: running at `esper.brijuice.dev` via an existing Cloudflare Tunnel, with `COOKIE_SECURE` enabled now that there's a real HTTPS edge in front of it.

### Changed

- Renamed to **Esper**. On first deploy this signs out every device once (the session cookie name changed), resets remembered accounts/categories, and forces one service-worker re-cache. Database names are untouched.
- Sharper palette, a press-feedback and hover-lift motion system, an active indicator on the navigation, and `prefers-reduced-motion` support throughout.
- Bottom navigation reorganised around four slots: Home, Activity, Plans and More.
- Wider layouts on desktop (lg/xl/2xl breakpoints) for Accounts, Settings, the app shell and sidebar; removed the unused create-next-app placeholder icons from `public/`.

### Tests

- 117 unit tests (up from 74) and 32 integration tests (up from 17), covering plan scheduling and progress, card utilisation and billing cycles, investment gains, and the full plan-to-ledger contract.

## 0.1.0 — Initial release

### Added

**Core**
- Next.js 16 App Router project with TypeScript, Tailwind v4, shadcn/ui (Base UI), Prisma 7 (`@prisma/adapter-pg`) and PostgreSQL 16.
- Data model: User, Account (owner Self/Brother), Category, Person, Loan, Transaction with 11 transaction types covering expenses, income, transfers, trading and loans.
- Financial calculation library: derived account balances, loan outstanding tracking, trading summaries and report aggregations, all on `decimal.js`.
- Single-source-of-truth transaction service handling create/update/delete with loan recalculation, run inside `Serializable` database transactions.

**Screens**
- Dashboard with owner filter, net worth, monthly summary, quick actions, account/category breakdown and recent activity.
- Add/edit transaction form with type-driven fields, remembered accounts/categories, and quick "save & add another".
- Activity history with search, filters (date range, type, category, account, owner, payment mode), pagination and CSV export.
- Accounts list and detail pages (archive/restore/delete, per-account history and quick actions).
- Categories screen with icon/colour picker and enable/disable.
- People & Loans overview and per-person detail with repayment tracking and progress bars.
- Trading module per owner (Self/Brother/All) with deposits, withdrawals, profit/loss and a monthly P&L chart.
- Reports screen with date-range presets, spending by category, income vs expense trend, owner breakdown, payment mode split and trading/loan summaries.
- Settings screen (profile, password change, theme, CSV exports, backup instructions, logout).

**Auth & security**
- bcrypt password hashing, signed HTTP-only session cookie (JWT via `jose`) with session-version revocation on password change.
- Route protection via `proxy.ts` plus a server-side data-access layer (`requireUser`) checked in every page and action.
- Server-side Zod validation on every mutation; safe redirect handling (`lib/safe-path.ts`); CSV export formula-injection guard.

**PWA**
- Web manifest, generated icons, offline fallback page, service worker for static asset caching, light/dark theme support.

**Ops**
- Multi-stage Dockerfile (standalone app image + one-shot migrate/seed container) and `docker-compose.yml` with health checks and a private PostgreSQL.
- `scripts/backup.sh` / `scripts/restore.sh` for `pg_dump`-based backups, `scripts/migrate-and-seed.sh` for automatic startup migrations, `scripts/generate-icons.ts` for PWA icons, `scripts/demo-data.ts` for local sample data.
- `.env.example`, README and this changelog.

**Testing**
- 74 unit tests covering balance/loan/trading/report calculations, validation schemas, money/date helpers and redirect safety.
- 17 integration tests exercising the transaction service against a real PostgreSQL database (loan sync, trading rules, cross-user isolation).

### Fixed (found in review before release)
- Pinned the container/app timezone (`TZ`, default `Asia/Kolkata`) so "today" and month boundaries no longer depend on the host's local time.
- Closed an open-redirect gap in `next`/`returnTo` query params (`//evil.com`, `/\evil.com`) with a shared `safePath` helper.
- Made the transaction type/account "kind" rules exclude trading accounts from plain expense/income/transfer/loan flows, so trading capital and the trading summary can no longer disagree.
- Blocked mixing owners' money when a trading account's owner is changed after it already has transactions.
- Fixed the Activity screen's custom date-range picker, which previously snapped back to a preset before the date inputs could render.
- Filtered out stale "remembered" account/category ids (archived, disabled or deleted) instead of silently submitting them.
- Made the Prisma client lazy so `next build` no longer requires `DATABASE_URL` to be set at build time.
