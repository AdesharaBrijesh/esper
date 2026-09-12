# Esper

A self-hosted, mobile-first personal finance tracker for daily expenses, income, account transfers, recurring commitments (course fees, subscriptions, bills, EMIs, SIPs), credit cards, investments, trading capital (for yourself and your brother), and money borrowed from or lent to friends. Built as an installable PWA and deployed with Docker Compose on a home server.

## Features

- **Daily money**: cash, UPI, bank and card expenses; income; account-to-account transfers.
- **Plans**: anything that repeats — school/college/bachelor's/master's fees, subscriptions, rent and utility bills, EMIs and SIPs. Set one up once and the whole schedule is generated, *past terms included*, so several years of fees can be entered in one go. See [Plans](#plans-fees-subscriptions-bills-emis-and-sips).
- **Credit cards**: outstanding balance, credit limit, utilisation, spend this month and the next bill due date. Paying the bill is a transfer, so nothing is double-counted.
- **Investments**: what you put in versus what it is worth, with gains derived from valuation snapshots you type in. No price feeds, no API keys, nothing to break.
- **Accounts**: cash, bank, UPI, card, trading, investment and other accounts, each owned by *Self* or *Brother*. Balances are always derived from the opening balance plus every transaction.
- **Trading module**: deposits, withdrawals, profit and loss per trading account, with capital and results reported per owner (Self / Brother / All).
- **Borrow & lend**: people, loans with outstanding balances, partial and full repayments, "you owe" / "owed to you" overviews.
- **Reports**: spending by category, monthly income vs expenses, owner breakdown, payment mode and cash vs online, trading summary, loan balances; presets and custom date ranges.
- **Activity**: filterable, paginated history with search; edit and delete with confirmation; balances recalculate automatically.
- **CSV export** of transactions (respecting filters), accounts, loans and plans.
- **PWA**: web manifest, icons, installable on Android Chrome and iOS Safari, offline fallback page, light and dark mode.
- **Single-user auth**: bcrypt-hashed password, HTTP-only signed session cookie, route protection, brute-force lockout and a nonce-based Content Security Policy.

### Core design principle

The app distinguishes five kinds of money movement and never mixes them:

| Kind | Examples | Effect |
| --- | --- | --- |
| Expense / Income | ₹250 food, ₹40,000 salary | Money leaves / enters an account. Counted in spending & income reports. |
| Transfer | Cash → Bank, Bank → Trading (deposit) | Moves between your accounts. Net worth unchanged. Never income or expense. |
| Trading profit / loss | +₹3,000 / −₹2,000 | Changes the trading account balance. Reported in the trading summary, not in spending. |
| Borrow / Lend | ₹5,000 from Rahul, ₹3,000 to Amit | Creates a loan with an outstanding balance. Repayments reduce it. Never income or expense. |
| Investment contribution | ₹5,000 SIP into an index fund | A transfer into an investment account. Net worth unchanged; growth is recorded as a valuation, not as income. |

All money is stored as `DECIMAL(14,2)` in PostgreSQL and handled with `decimal.js` in code. No floating point arithmetic touches financial values.

### Plans: fees, subscriptions, bills, EMIs and SIPs

A **plan** is a template (what, how much, how often, paid from where) plus a generated schedule of **instalments**. The rule that keeps it honest:

> A plan never moves money. A *paid instalment* does — and it does so by creating an ordinary transaction.

That single decision is why balances, reports and CSV exports need no special cases, and why undoing a payment can simply delete the transaction it created.

| Kind | What it is for | Produces |
| --- | --- | --- |
| Fees | School, college, bachelor's, master's — usually a fixed number of terms | An expense |
| Subscription | Netflix, Spotify, gym, cloud storage — renews until cancelled | An expense |
| Bill | Rent, electricity, internet, phone | An expense |
| EMI | Loan or purchase instalments with a known end date | An expense |
| SIP | A recurring investment | A **transfer** into an investment account |

**Entering past years.** Backdate the first due date and set the number of instalments — a B.Tech that started in July 2023 with 8 half-yearly terms generates all 8 immediately. On the plan screen, *Select N overdue* then *Mark paid* settles them in one action, and each payment is dated on **its own due date**, so past terms land in the right months in your reports instead of piling onto today.

Instalments can be re-priced, skipped (a waived term, a paused subscription), or undone. Editing a plan's amount re-prices only what is still unpaid — it never rewrites what you actually paid last year. Fixed-length plans close themselves when nothing is pending; open-ended ones schedule a rolling year ahead and are extended with *Add 12 more*.

### Credit cards

A card is an ordinary account whose **negative balance is the amount owed**. Spending on it is a normal expense; paying the bill is a transfer from a bank account into the card. Set a credit limit and a due day on the account to get utilisation tracking and a bill reminder. No separate card ledger exists, so the card can never disagree with your transaction history.

### Investments

An investment account's balance is what you have put in (transfers in, less anything redeemed). Recording a **valuation** — the figure you read off your broker's app whenever you happen to look — gives the current worth, and the gain is simply the difference. Without a valuation a holding is shown at cost, which is the honest answer rather than zero.

## Tech stack

Next.js 16 (App Router, Server Components, Server Actions, Route Handlers, Proxy), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), Lucide icons, PostgreSQL 16, Prisma 7 (`@prisma/adapter-pg`), Zod 4, React Hook Form, Recharts, `jose` (session tokens), `bcryptjs`, Vitest.

## Local development

### Prerequisites

- Node.js 22 (20.19+ works)
- PostgreSQL 16+ running locally, **or** Docker to run one

### Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` for local development. Point `DATABASE_URL` at your local PostgreSQL (the compose default uses the host name `postgres`, which only resolves inside Docker):

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/esper_dev
TEST_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/esper_test   # optional, for integration tests
AUTH_SECRET=some-long-random-string
SEED_USER_NAME=Me
SEED_USER_EMAIL=admin@example.com
SEED_USER_PASSWORD=choose-a-password   # at least 8 characters
```

If the database password contains special characters (`@ : / ? # %`), URL-encode them in `DATABASE_URL` (for example `@` becomes `%40`).

Create the database (`CREATE DATABASE esper_dev;`), then:

```bash
npm run db:migrate      # prisma migrate dev – applies migrations and generates the client
npm run db:seed         # creates the user, default categories and zero-balance example accounts
npm run dev             # http://localhost:3000
```

Sign in with `SEED_USER_EMAIL` / `SEED_USER_PASSWORD`. Optional: `npm run db:demo` fills an empty database with sample transactions to explore the UI.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | `prisma generate` + `next build` (standalone output) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests for the financial logic (no database needed) |
| `npm run test:integration` | Database-backed tests of the transaction and plan services (needs `TEST_DATABASE_URL`) |
| `npm run test:all` | Unit + integration |
| `npm run reset-password` | Emergency password reset (see below) |
| `npm run check` | typecheck + lint + test + build |
| `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma helpers |
| `npm run db:demo` | Sample data for an empty dev database |
| `npm run icons` | Regenerate PWA icons from the inline SVG (uses `sharp`) |

## Docker development

```bash
cp .env.example .env   # edit passwords / secrets
docker compose up --build
```

Then open http://localhost:3000 (or `APP_PORT`).

## Production deployment (Ubuntu home server)

```bash
git clone YOUR_REPOSITORY expense-tracker
cd expense-tracker
cp .env.example .env
nano .env
docker compose up -d --build
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `TZ` | Timezone for "today" and month boundaries (default `Asia/Kolkata`) |
| `APP_PORT` | Host port published by Compose (default `3000`) |
| `PORT` | Port inside the container (`3000`) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Credentials for the PostgreSQL container |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@postgres:5432/DB` – must match the values above; URL-encode special characters |
| `AUTH_SECRET` | Long random string used to sign session cookies. Generate with `openssl rand -base64 48` |
| `COOKIE_SECURE` | Optional. Set to `false` if you open the app over plain HTTP on your LAN (no HTTPS); otherwise cookies are `Secure` in production |
| `SEED_USER_NAME`, `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` | Initial login, created on first start if no user exists (password never overwritten later) |
| `SEED_EXAMPLE_ACCOUNTS` | `true` (default) creates zero-balance example accounts on first start; set `false` to start empty |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_THEME_COLOR` | Branding, baked in at build time |

Never commit `.env`.

### What Compose runs

```text
Internet → Cloudflare Tunnel / reverse proxy → app (Next.js, :3000) → internal network → postgres
```

- `postgres` – `postgres:16-alpine`, data in the named volume `postgres_data`, health-checked, **not** published on the host.
- `migrate` – one-shot container built from the same Dockerfile: waits for the database, runs `prisma migrate deploy`, then the idempotent seed, and exits. Runs on every `docker compose up`, so schema updates are applied automatically and safely (no destructive resets).
- `app` – lean standalone Next.js image; starts only after migrations succeed. Health check hits `/api/health`, which also verifies database connectivity.

Put the app behind HTTPS (Cloudflare Tunnel, Caddy, nginx, Traefik). If you access it directly over HTTP on the LAN, set `COOKIE_SECURE=false` or the login cookie will be rejected by the browser.

### Updating

```bash
git pull
docker compose up -d --build
```

### Logs

```bash
docker compose logs -f          # everything
docker compose logs -f app      # only the app
docker compose logs migrate     # migration / seed output
```

### Stopping

```bash
docker compose down             # stops containers; the postgres_data volume keeps your data
docker compose down -v          # DANGER: also deletes the database volume
```

## Backup and restore

`scripts/backup.sh` dumps the database with `pg_dump` from the running container into `./backups/esper_<date>.sql.gz` (outside the container) and prunes files older than `KEEP_DAYS` (default 30):

```bash
./scripts/backup.sh
BACKUP_DIR=/mnt/nas/esper KEEP_DAYS=90 ./scripts/backup.sh
```

Schedule it with cron on the host:

```cron
30 2 * * * cd /opt/expense-tracker && ./scripts/backup.sh >> /var/log/esper-backup.log 2>&1
```

Restore a dump (this overwrites the current database):

```bash
./scripts/restore.sh backups/esper_2026-09-08_023000.sql.gz
```

The underlying commands, if you prefer to run them by hand:

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup.sql.gz
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## Data model

- **User** – login (single user in v1; every record is scoped by `userId` so multi-user can be added later).
- **Account** – `name`, `type` (CASH, BANK, UPI, CARD, TRADING, OTHER), `owner` (SELF, BROTHER), `openingBalance`, `isActive` (archive instead of delete once it has history).
- **Category** – `name`, `type` (EXPENSE, INCOME), emoji `icon`, `color`, `isActive`.
- **Person** – someone you borrow from or lend to.
- **Loan** – `personId`, `direction` (BORROWED, LENT), `originalAmount`, `outstandingAmount`, `status` (ACTIVE, PAID). Outstanding is recomputed inside the same database transaction whenever a linked transaction changes.
- **Transaction** – `type`, `amount`, `owner`, `paymentMode`, `transactionDate`, optional `categoryId`, `fromAccountId`, `toAccountId`, `loanId`, `notes`.
- **Plan** – a recurring commitment: `kind` (FEE, SUBSCRIPTION, BILL, EMI, SIP, OTHER), `name`, `amount`, `frequency`, `startDate`, optional `endDate`/`totalCount`, the account it is paid from, and a category (or, for a SIP, the investment account it funds).
- **Installment** – one dated amount within a plan: `sequence`, `dueDate`, `amount`, `status` (PENDING, PAID, SKIPPED) and the `transactionId` it created when paid. "Overdue" and "due soon" are derived from the date, never stored.
- **Valuation** – a dated `value` for an investment account. One per account per day; recording again the same day replaces it.

Account also carries `institution`, `last4`, and — for cards — `creditLimit`, `statementDay` and `dueDay`.

Every transaction moves `amount` **from** `fromAccountId` (balance decreases) **to** `toAccountId` (balance increases); either side may be empty:

| Type | From | To | Notes |
| --- | --- | --- | --- |
| EXPENSE | account | – | category required (expense) |
| INCOME | – | account | category required (income) |
| TRANSFER | account | account | different accounts |
| TRADING_DEPOSIT | bank/cash | trading account | owner = trading account owner |
| TRADING_WITHDRAWAL | trading account | bank/cash | |
| TRADING_PROFIT | – | trading account | optional income category |
| TRADING_LOSS | trading account | – | |
| BORROW | (person) | account | creates a BORROWED loan |
| LEND | account | (person) | creates a LENT loan |
| LOAN_REPAYMENT | account | (person) | reduces a BORROWED loan; cannot exceed outstanding |
| LENT_REPAYMENT | (person) | account | reduces a LENT loan; cannot exceed outstanding |

Validation rules enforced server-side: positive amounts (2 decimals), no same-account transfers, correct account kinds for trading types, category type must match, loan repayments never exceed the outstanding amount, a borrow/lend cannot be deleted or re-typed while repayments exist, archived accounts cannot receive new transactions, and every query is scoped to the signed-in user.

## Project structure

```text
app/
  (auth)/login/            login page
  (app)/                   protected shell (sidebar + bottom nav)
    page.tsx               dashboard
    transactions/          activity, new, [id] (detail/edit/delete)
    accounts/              list, [id] detail + history
    categories/
    loans/                 people overview, [personId] detail
    trading/
    reports/
    settings/
  api/health/              health check (app + database)
  api/export/[kind]/       CSV export (transactions | accounts | loans)
  manifest.ts, offline/    PWA
components/
  ui/                      shadcn/ui primitives
  shared/                  Money, forms, lists, dialogs, pagination…
  layout/                  sidebar, bottom nav, theme toggle
  charts/                  Recharts wrappers
  dashboard/ transactions/ accounts/ categories/ loans/ reports/ settings/
lib/
  prisma.ts                Prisma client (pg adapter)
  auth/                    password hashing, JWT session cookie, data-access layer
  calculations/            pure financial logic (balances, loans, trading, reports)
  validations/             Zod schemas
  services/transactions.ts create / update / delete with loan sync (single source of truth)
  data/                    server-only queries (accounts, transactions, loans, trading, dashboard, reports)
  actions/                 server actions (auth, transactions, accounts, categories, people, settings)
  money.ts, dates.ts, constants.ts, csv.ts, errors.ts, types.ts
prisma/                    schema, migrations, seed
public/                    icons, service worker (sw.js)
scripts/                   backup.sh, restore.sh, migrate-and-seed.sh, generate-icons.ts, demo-data.ts
tests/                     unit tests + tests/integration (database)
Dockerfile, docker-compose.yml, .dockerignore, .env.example, prisma.config.ts, proxy.ts
```

## Security notes

- Passwords hashed with bcrypt (cost 12).
- **Brute-force protection**: login is rate-limited on both the client IP *and* the submitted email, with an escalating lockout (5 failures → 1 minute, doubling to a 30-minute cap). The email key matters because forwarded IP headers are spoofable unless a trusted proxy sets them. Password change is limited the same way, so a stolen session is not an oracle for the existing password. Counters are process-local and clear on restart, which is the right amount of machinery for a single-container, single-user app.
- **Timing**: a failed login always spends one bcrypt comparison, even when no user matches, so response time does not reveal which emails exist.
- **Content Security Policy**: `proxy.ts` issues a per-request nonce and Next stamps it onto every script tag; `script-src` is `'self' 'nonce-…' 'strict-dynamic'`, which is what actually stops injected script from running. `style-src` keeps `'unsafe-inline'` deliberately — Base UI positions popovers and Recharts sizes its SVG through inline style attributes that a nonce cannot cover, and injected CSS is a far smaller problem than injected JS. Set `CSP_MODE=basic` to drop the nonce, or `off` to disable it, if you ever add a third-party script that will not cooperate.
- Also sent on every response: `X-Frame-Options: DENY` and `frame-ancestors 'none'` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS unless `COOKIE_SECURE=false` marks the deployment as plain-HTTP LAN.
- **Environment validation** runs at boot (`instrumentation.ts`). Production refuses to start on a missing, too-short or placeholder `AUTH_SECRET`, instead of failing on the first request that happens to need it.
- The app is served `noindex` and ships a `robots.txt` that disallows everything.
- Sessions are signed JWTs (HS256, `AUTH_SECRET`) in an HTTP-only, SameSite=Lax cookie valid for 30 days. Each token carries the user's `sessionVersion`; changing the password bumps it and signs out other devices.
- `proxy.ts` redirects unauthenticated requests optimistically; the real check is `requireUser()` in every page and server action (data-access layer), so server functions cannot be called without a valid session.
- All mutations are validated with Zod on the server; database errors are mapped to safe messages and never shown raw.
- PostgreSQL is reachable only on the internal Docker network.
- Redirect targets (`next`, `returnTo`) are validated with `lib/safe-path.ts` to prevent open-redirect tricks (`//evil.com`, `/\evil.com`).
- CSV exports neutralise formula injection (cells starting with `=`, `+`, `-`, `@` are escaped).
- Transaction create/update/delete, and every instalment write, run in a `Serializable` database transaction, so two concurrent repayments on the same loan cannot both succeed and overpay it.

### If you forget your password

There is no email reset in a self-hosted single-user app, so use the script:

```bash
npm run reset-password -- you@example.com "new-password"     # local
docker compose exec app node_modules/.bin/tsx scripts/reset-password.ts you@example.com "new-password"
```

Omit the password and one is generated for you. Either way `sessionVersion` is bumped, signing out every device.

## Testing

```bash
npm test                    # pure logic: balances, loans, trading, reports, validations, money & date helpers, safe redirects
npm run test:integration    # transaction service against a real PostgreSQL (TEST_DATABASE_URL)
```

The integration suite covers expense/income/transfer effects, trading rules and owner checks, borrowing and lending with partial and full repayments, over-repayment rejection, editing and deleting with loan recalculation, and cross-user isolation. For plans it proves the contract the feature rests on: creating a plan moves no money, paying an instalment writes a real transaction and moves the balance by exactly that amount, a SIP produces a transfer rather than an expense, undoing a payment (or deleting its transaction from the Activity screen) returns the instalment to pending, editing a plan never rewrites paid history, and one user cannot touch another's instalments.

CI runs both suites on every push, the integration one against a PostgreSQL service container (`.github/workflows/ci.yml`).

## Installing as an app

- **Android (Chrome)**: open the site → menu ⋮ → *Install app* (or *Add to Home screen*).
- **iPhone (Safari)**: Share → *Add to Home Screen*.

The service worker caches static assets and shows `/offline` when the network is unavailable. Data always comes from the server; there is no offline editing.

## Limitations and ideas for later

- Single user in v1 (data model is multi-user ready; add sign-up and per-user settings).
- No audit log, budgets, attachments, CSV *import* or multi-currency.
- Reports are computed on demand from transactions in the range (fine for personal volumes; add cached monthly rollups if it ever grows large).
- Brother is an *owner label*, not a login; a future version could give him his own account with shared visibility.
- Plans do not auto-post. Paying is deliberate, because an instalment that posts itself while a payment actually bounced is worse than one you confirm.
- Investment valuations are entered by hand on purpose — a price feed is one more thing that can break or start charging.
- Possible additions: budgets per category, receipts, CSV import, per-account reconciliation ("mark balance as verified"), push reminders for due instalments.
