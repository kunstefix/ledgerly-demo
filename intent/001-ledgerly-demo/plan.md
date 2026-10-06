# Plan: Ledgerly demo app

Status: done <!-- draft | approved | done -->
Spec: ./spec.md
Branch: worktree-001-ledgerly-demo (PR against `master`)

## Approach
Greenfield build in the order the pieces depend on each other, committing at each step:

1. **Tooling**: pnpm workspace-less single package, Node 24 (`.nvmrc`, `engines`),
   TypeScript strict ESM, ESLint (typescript-eslint flat config), Prettier, Vitest.
   `pnpm verify` = `lint && typecheck && test && format:check`.
2. **Database**: `db/schema.sql` (tables), `db/seed.sql` (generated), `db/support.sql`
   (views + `loopback_reader` role). These three files are the only migrations: the `db`
   image runs them from `/docker-entrypoint-initdb.d/` in that order, and tests load the
   same files into a Testcontainers Postgres 17. The app never runs DDL.
3. **Business rules** (`src/billing/*`, `src/invoices/*`): pure functions over integer
   cents, written correctly first with tests, then the five bugs planted as small,
   plausible one-line slips on paths the tests don't cover.
4. **Seed generator** (`scripts/generate-seed.ts`): a seeded PRNG (mulberry32) builds the
   12 customers, ~300 invoices and 6 months of billing history, and writes
   `db/seed.sql`. **Dates are relative to DB init**: every timestamp is emitted as an SQL
   expression on `now()` (the seed runs in one transaction, so `now()` is a single
   instant), e.g. `now() - interval '41 days 3 hours'`. Data that must fall "this month"
   (Maple's B3 invoices, current usage) uses
   `least(now(), date_trunc('month', now()) + interval '…')` so it stays in the current
   month even when the db initialises on the 1st. The SQL text is byte-identical across
   runs; the data is identical relative to init time.
5. **Server and views**: Fastify with `@fastify/cookie` (signed session cookie,
   `SameSite=Lax`, `HttpOnly`), `@fastify/formbody`, `@fastify/static` for one CSS file.
   Views are functions that return `html\`…\`` tagged templates that escape by default
   (`raw()` only for already-built fragments). No client JS other than the widget tag.
6. **Loopback integration** (`src/loopback/*`): config read per request from
   `LOOPBACK_CONFIG_FILE`, env overrides, `jose` HS256 token, widget tag or "support chat
   isn't configured" banner in the layout; `named-queries.json` and the help archive
   served under `/loopback/`.
7. **Billing tick** (`src/billing/tick.ts`): advances due retries and subscription
   status. Payment outcomes are deterministic from the stored fake card: like Stripe's test
   cards, `…0002` declines (`card_declined`), `…9995` fails `insufficient_funds`,
   `…0069` fails `expired_card`, anything else succeeds. Only brand, last4 and expiry are
   stored, never the full number.
8. **Images, Compose, CI**: one multi-stage `Dockerfile` (`app`, `db` targets),
   `docker-compose.yml`, GitHub Actions for PR checks and multi-arch publishing on
   `master`.
9. **Help center, `PLANTED_BUGS.md`, README.**

Styling: one hand-written `public/styles.css` (~300 lines) for a believable small SaaS:
top nav, cards, tables, status badges, forms, and a single-column layout below 720px.

### Personas (each shows one bug or one data question)
| Id | Plan / place | Shows |
|----|--------------|-------|
| `cus_maple` | Starter, Canada (`America/Toronto`) | B3: 3 sent + 2 deleted/draft this month → "limit reached" at 5 |
| `cus_alder` | Pro→Business upgrade 24 days into the period, Slovenia | B1: upgrade charged ≈ €56 instead of the prorated ≈ €14 (see Deviations) |
| `cus_fjord` | Pro, Norway (EUR) | `card_declined` payment pending retry 2 of 3 |
| `cus_lumen` | Pro, Spain | B2: card updated after 2 failures, next failure canceled the subscription |
| `cus_kestrel` | Business, Germany | B4: an invoice whose total is 1 cent off the sum of its lines |
| `cus_tidewater` | Pro, US (`America/New_York`) | B5: due dates show one day early |
| `cus_sable` | Business annual, France | data question: "when is my next payment and how much?" |
| 5 more | mixed plans, US/DE/FR/SI | background history: successes, a recovered retry, one canceled |

## Changes
| File | Change |
|------|--------|
| `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `.npmrc` | Node 24, pnpm via corepack; scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `format`, `format:check`, `verify`, `seed:generate`, `billing:tick`, `bugs:repro` |
| `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`, `vitest.config.ts` | Strict TS, ESM, lint/format/test config |
| `.gitignore`, `.dockerignore`, `.env.example` | Ignore `dist/`, `node_modules/`, local loopback config; published demo values for `SESSION_SECRET`, `DATABASE_URL`, reader password |
| `db/schema.sql` | `customers`, `plans`, `subscriptions`, `cards`, `billing_invoices`, `payments`, `payment_retries`, `invoices`, `invoice_lines` (R1) |
| `db/seed.sql` | Generated, committed (R6) |
| `db/support.sql` | Schema `support`, 4 views, role `loopback_reader` with USAGE + SELECT only, `default_transaction_read_only = on`, `REVOKE` on `public` (R9) |
| `scripts/generate-seed.ts`, `scripts/seed/*.ts` | Deterministic generator and persona definitions (R6) |
| `scripts/billing-tick.ts` | `pnpm billing:tick` (R5) |
| `scripts/reproduce-bugs.ts` | Prints each B1–B5 symptom from the seeded db (B1–B5 check) |
| `src/server.ts`, `src/app.ts`, `src/config.ts` | Entry point; `buildApp()` factory used by tests; env parsing |
| `src/db/pool.ts`, `src/db/queries/*.ts` | `pg` pool and plain-SQL query functions per area |
| `src/session.ts` | Signed cookie helpers, `requireCustomer` hook (R2) |
| `src/routes/{home,dashboard,invoices,billing,internal,health,loopback}.ts` | Pages and form posts (R2, R3, R5, R10, R11, R13) |
| `src/views/{html,layout,home,dashboard,invoices,invoice,invoice-form,billing,card-form,internal,format}.ts` | Escaping template helper, layout with nav + widget/banner, pages, money/date formatting |
| `src/billing/proration.ts` | Prorated plan-change charge (R4; B1) |
| `src/billing/retries.ts` | Retry schedule (days 1, 3, 7) and card-update handling (R4; B2) |
| `src/billing/failure-codes.ts` | Failure code → plain explanation (R4) |
| `src/billing/tick.ts`, `src/billing/charge.ts` | Daily job and deterministic fake charges (R5) |
| `src/invoices/limits.ts` | Monthly invoice limit per plan (R4; B3) |
| `src/invoices/totals.ts` | Line and invoice totals with VAT (R4; B4) |
| `src/invoices/dates.ts` | Due date display in the customer's timezone (R4; B5) |
| `src/loopback/config.ts`, `src/loopback/token.ts`, `src/loopback/widget.ts`, `src/loopback/help-export.ts` | R7, R8, R11 |
| `public/styles.css` | UI styling |
| `loopback/named-queries.json` | 4 named queries (R10) |
| `help/*.md` | 12 articles with front matter (R11) |
| `PLANTED_BUGS.md` | B1–B5: symptom, file:line, correct behavior, affected persona |
| `Dockerfile` | `app` (node:24-slim, pruned prod deps, `dist/`, `public/`, `help/`, `loopback/`) and `db` (`postgres:17` + init SQL) targets (R12) |
| `docker-compose.yml` | `db` + `app` on :4000, healthchecks, optional `./loopback.json` mount (R13) |
| `.github/workflows/ci.yml` | PRs and pushes: install, `pnpm verify`, `docker build` both targets (R14) |
| `.github/workflows/publish.yml` | Push to `master`: buildx + QEMU, `linux/amd64,linux/arm64`, push `latest` and sha tags to GHCR (R12) |
| `README.md` | What Ledgerly is, run it, personas, Loopback contract, "never reuse with real data" |
| `CLAUDE.md` | Default branch reverted to `master` (already done) |

## Tests
Vitest. Unit tests run without Docker; integration tests share one Testcontainers
Postgres 17 (global setup loads `schema.sql`, `seed.sql`, `support.sql`).

| Test file | Proves |
|-----------|--------|
| `test/unit/proration.test.ts` | R4: downgrade credit, same-plan no-op, start/end-of-period edges (not the mid-period upgrade path, B1) |
| `test/unit/retries.test.ts` | R4: schedule of 3 retries over 7 days, cancel after the 3rd failure (not card update, B2) |
| `test/unit/limits.test.ts` | R4: Pro/Business limits, unlimited, counting sent invoices (no deleted/draft fixtures, B3) |
| `test/unit/totals.test.ts` | R4: single-line and zero-VAT totals (no multi-line rounding case, B4) |
| `test/unit/dates.test.ts` | R4: UTC and east-of-UTC customers (no west-of-UTC case, B5) |
| `test/unit/failure-codes.test.ts` | R4: every code has an explanation, unknown code fallback |
| `test/unit/html.test.ts` | Escaping by default, `raw()` passthrough (XSS risk) |
| `test/unit/token.test.ts` | R7: HS256, claims `sub`/`email`/`name`, `exp` = now + 1h |
| `test/unit/loopback-config.test.ts` | R8: file read per call, env overrides, missing/invalid file → `null` |
| `test/integration/seed.test.ts` | R6: counts (12 customers, ~300 invoices, 6 months of billing), personas present, generator output equals committed `db/seed.sql`, two loads give identical rows relative to `now()` |
| `test/integration/support-role.test.ts` | R9: reader selects each view with only the listed columns; denied on `public.*`; `INSERT`/`UPDATE`/`CREATE` fail; read-only default |
| `test/integration/named-queries.test.ts` | R10: each query returns rows for its persona and none for another id, run as `loopback_reader` |
| `test/integration/routes.test.ts` | R2, R3, R13: Fastify `inject`: sign in as, every page renders for a persona, create/send/delete invoice, change plan, update card, sign out, `/healthz`, unauthenticated redirect, escaped invoice notes |
| `test/integration/widget.test.ts` | R7, R8: page with config has the script tag with a valid token; without it shows the banner |
| `test/integration/tick.test.ts` | R5: tick advances a pending retry and updates subscription status |
| `test/integration/loopback-routes.test.ts` | R10, R11: `named-queries.json` served; help archive lists all 12 articles with valid front matter |

Not automated: images pullable anonymously from GHCR, `docker compose up` serving :4000
(manual check after merge), and Loopback's side (M3 part 7).

## Risks / rollback
- **Bugs leaking into tests**: a test that exercises a buggy path would either fail or
  enshrine the bug. Each rule test file gets a header comment naming the planted bug it
  deliberately avoids; the repro script is the only thing that touches those paths.
- **Read-only role holes**: Postgres grants `CREATE` and `USAGE` on `public` to `PUBLIC`
  by default in older versions; `support.sql` revokes explicitly and the role test covers
  it.
- **Relative dates at month boundaries**: handled with `least(now(), …)`; the seed test
  checks Maple's invoices fall in the current month.
- **Testcontainers in CI and locally**: needs Docker. GitHub's Ubuntu runners have it.
- **Multi-arch publish** under QEMU is slow (~10 min); it runs only on `master`, not PRs.
- **GHCR visibility**: the first publish may land private; making both packages public is
  a one-time manual step, written down in the README.
- **Rollback**: nothing outside this repo uses it until Loopback's demo profile pulls the
  images; reverting the merge commit and deleting the image tags undoes everything.

## Verification
- [x] `pnpm verify` (lint + typecheck + tests + format check)
- [x] `pnpm build`
- [x] `docker compose build` and `docker compose up`: :4000 serves, sign in as each
      persona, `/healthz` ok
- [x] `pnpm bugs:repro` against the compose db shows B1–B5
- [x] UI check on desktop and mobile width: no UI check command in CLAUDE.md; manual
      look at home, dashboard, invoices, billing at 1280px and 375px

## Deviations
- **B1 symptom.** The spec describes B1 both as "charges the full new price" and as "uses
  the elapsed fraction where it should use the remaining one". Those two descriptions
  don't agree. I followed the mechanism. An upgrade late in the period is charged most of
  the full price difference (`cus_alder`: about €56 instead of €14). One early in the
  period is charged almost nothing. `PLANTED_BUGS.md` describes the actual behavior.
- **Unplanned files:**
  - `src/billing/actions.ts` (plan change and card update orchestration, which keeps the
    routes thin).
  - `scripts/seed/{sql,customers,build}.ts` (the generator split into parts).
  - `test/integration/{global-setup,db,sql}.ts` (test harness).
  - `public/favicon.svg`.
  - Query modules live in `src/db/queries/{customers,subscriptions,invoices,billing}.ts`
    as planned.
- **Reader role in tests.** Global setup loads the three SQL files once into the default
  database, which creates the cluster-wide `loopback_reader` role from the real
  `support.sql`. Each test file then loads them into its own database. `support.sql` sets
  the role's settings only when it creates the role, because parallel `ALTER ROLE ... SET`
  statements race.
- **Seed determinism test.** Two loads are compared with timestamps as minutes from load
  time, not milliseconds. Rows anchored to the start of the month ("this month") don't
  move with `now()`.
- **Toolchain.** TypeScript 6.0 (typescript-eslint doesn't support 7 yet), pnpm 10.34.6.
  Prettier has `embeddedLanguageFormatting: off`, because reformatting `html` templates
  changes the strings they produce.
- **UI check.** The Chrome extension wasn't connected, so I drove headless Chrome over CDP
  with a script in the scratchpad, not committed. It took 7 screens at 1280px and 375px.
  No horizontal overflow, and no console errors once the favicon was added.
- **Workflow config ships here.** The `.claude/` agents, hooks, skills and settings,
  `CLAUDE.md` and `.gitignore` came in commit `19fe1e2`, before the spec. They aren't on
  `master` yet, so they're part of this PR.
- **Compose config mount.** Compose mounts the `./config/` directory read-only at
  `/config`, and the app reads `/config/loopback.json`. The plan said "an optional
  `./loopback.json` mount". A directory works even before Loopback's demo-setup has
  written the file.
- **Seed countries.** Canada (`cus_maple`) and Norway (`cus_fjord`) are seeded alongside
  the spec's list (DE, FR, ES, SI, US).
