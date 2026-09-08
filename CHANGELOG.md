# Changelog

All notable changes to this project are documented here.

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
