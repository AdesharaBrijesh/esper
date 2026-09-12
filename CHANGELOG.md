# Changelog

All notable changes to this project are documented here.

## Unreleased — v1 preparation

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

### Changed

- Renamed to **Esper**. On first deploy this signs out every device once (the session cookie name changed), resets remembered accounts/categories, and forces one service-worker re-cache. Database names are untouched.
- Sharper palette, a press-feedback and hover-lift motion system, an active indicator on the navigation, and `prefers-reduced-motion` support throughout.
- Bottom navigation reorganised around four slots: Home, Activity, Plans and More.

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
