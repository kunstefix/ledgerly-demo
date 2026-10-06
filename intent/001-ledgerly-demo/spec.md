# Spec: Ledgerly demo app

Status: approved <!-- draft | approved -->
Intent: ./intent.md

## Summary
Ledgerly is a server-rendered Node app where small businesses send invoices to their
clients and pay Ledgerly a subscription. A demo visitor picks a seeded customer and
browses their dashboard, invoices and billing. Every page embeds the Loopback widget with
a token signed for that customer. Ledgerly's Postgres ships as its own seeded image with
a `support` schema of views that a read-only `loopback_reader` role can query. The repo
carries a markdown help center, a named-queries file for Loopback, and five planted bugs.

**Done when** `docker compose up` in this repo serves Ledgerly at `http://localhost:4000`
with seeded data; the `loopback_reader` role can read only the `support` views; the
images are published on GHCR; and Loopback's `demo` profile can use them (verified from
the Loopback side, M3 part 7).

## Requirements

**App**
- R1. Domain: `customers` (company, contact email, country, timezone, external id
  `cus_…`), `plans` (Starter free with 5 invoices a month, Pro $29 with 200, Business $99
  unlimited), `subscriptions` (monthly or annual, `active|past_due|canceled`, current
  period), `billing_invoices` and `payments` (what Ledgerly charges the customer, with
  failure codes), `payment_retries` (a schedule of 3 retries over 7 days), and
  `invoices` with `invoice_lines` (what the customer sends their own clients, with VAT).
- R2. "Sign in as": the home page lists seeded customers; choosing one sets a signed
  session cookie. No passwords (it's a demo, and the page says so). Signing out clears it.
- R3. Pages for the signed-in customer: dashboard (plan, usage this month, next payment),
  invoices (list, view, create, send, delete), billing (subscription, change plan with
  proration, billing invoices, payments with failure reasons, update card with a fake
  card form), and a help link to Loopback's public help site when configured.
- R4. Business rules live in small modules the agent can read: `src/billing/proration.ts`,
  `src/billing/retries.ts`, `src/invoices/limits.ts`, `src/invoices/totals.ts`,
  `src/invoices/dates.ts`, `src/billing/failure-codes.ts` (code → plain explanation).
- R5. A daily job (run on demand in the demo with `pnpm billing:tick` or a button on an
  internal page) advances retries and subscription status, so failed payments evolve.

**Planted bugs** (`PLANTED_BUGS.md` lists each: symptom a customer would report, the
file and line, and the correct behavior)
- B1. Upgrading mid-period charges the full new price instead of the prorated difference
  (`proration.ts` uses the elapsed fraction where it should use the remaining one).
- B2. Updating the card doesn't reset the retry counter, so the next failure cancels the
  subscription immediately (`retries.ts`).
- B3. The monthly invoice limit counts deleted and draft invoices, so Starter customers
  hit "limit reached" early (`limits.ts`).
- B4. VAT is rounded per line instead of per invoice, so some totals are one cent off the
  sum of the lines (`totals.ts`).
- B5. Due dates show one day early for customers in timezones west of UTC (`dates.ts`).
Each bug affects at least one seeded customer, and tests never assert the buggy path.

**Seed data**
- R6. Deterministic seed: 12 customers across plans, countries (incl. Germany, France,
  Spain, Slovenia, US) and timezones; about 300 invoices; 6 months of billing history
  with successful, failed and retried payments. Named demo personas each show one bug or
  one data question (e.g. `cus_maple` hit B3; `cus_fjord` has a card-declined payment
  pending retry; `cus_tidewater` in New York sees B5).

**Integration contract with Loopback**
- R7. Widget: every signed-in page includes
  `<script src="{apiPublicUrl}/widget.js" data-loopback-widget="{connectionId}"
  data-customer-token="{jwt}" async>`. The JWT is HS256 with the connection's identity
  secret, claims `sub` (external id), `email`, `name`, `exp` one hour ahead.
- R8. Loopback settings come from `LOOPBACK_CONFIG_FILE` (JSON: `apiPublicUrl`,
  `widgetConnectionId`, `identitySecret`, optional `helpCenterUrl`), read per request so
  `demo-setup` can write it after Ledgerly starts. Missing or invalid file: no widget, and
  a small banner says support chat isn't configured. Env vars with the same names
  (`LOOPBACK_API_PUBLIC_URL` …) override the file for standalone use.
- R9. Database: schema `support` with views `customer_account`, `billing_invoices`,
  `payments`, `recent_invoices`, each with a `customer_id` column holding the external
  id and no card numbers, emails of the customer's clients or other personal data
  beyond the customer's own name and email. Role `loopback_reader` (password published
  for the demo) has `USAGE` on `support` and `SELECT` on those views only, no access to
  `public`, and `default_transaction_read_only = on`.
- R10. `loopback/named-queries.json`: `account_overview`, `recent_payments`,
  `billing_invoices`, `recent_invoices`, each a `SELECT` from one view with
  `WHERE customer_id = $1` and a description for the agent. Served at
  `GET /loopback/named-queries.json`.
- R11. `help/*.md`: about 12 articles with front matter (`title`, `slug`, `visibility`,
  `collection`) on plans and limits, invoices, VAT, due dates, payments and retries,
  failure codes, changing plans, cancelling, and one `agent`-visibility refund policy
  ("refunds are handled by a human"). Served as an archive at
  `GET /loopback/help-export.tar.gz`. The articles describe the intended behavior; the
  bugs contradict them, as real bugs do.

**Images and tooling**
- R12. One Dockerfile with targets `app` (`ghcr.io/kunstefix/ledgerly-demo`) and `db`
  (`ghcr.io/kunstefix/ledgerly-demo-db`: `postgres:17` plus init SQL for schema, seed,
  views and role). Both multi-arch (`amd64`, `arm64`), built and pushed by GitHub
  Actions on `master` with tags `latest` and the commit sha, and made public.
- R13. `docker-compose.yml` here runs `db` and `app` standalone (port 4000) with
  `.env.example` defaults. Health endpoint `GET /healthz`.
- R14. CI on pull requests: lint, typecheck, tests, format check, image build.

## Out of scope
- Real auth, real payments, emails to clients, PDF invoices, multi-user accounts.
- Any Loopback code or knowledge of Loopback beyond the widget tag and token format.
- Fixing the planted bugs.

## Design
- **Stack**: Node 24, TypeScript strict, Fastify with server-rendered HTML (tagged
  template helpers that escape by default, no client framework), `pg` with plain SQL
  migrations, `jose` for tokens, Vitest with Testcontainers, pnpm. Small CSS file, no
  build step for the UI.
- **Layout**: `src/{server,routes,views,billing,invoices,db,loopback}`, `db/{schema,seed,
  support}.sql` (generated seed is committed), `help/`, `loopback/`, `PLANTED_BUGS.md`.
- **Session**: a signed cookie holding the customer id (`@fastify/cookie` signing with
  `SESSION_SECRET`, published demo value).
- **Money**: integer cents throughout; currency EUR or USD per customer.

## Risks & concerns
Security checklist applied lightly: this is a public demo with fake data.
- **Read-only role**: the whole point is that Loopback can only read customer-scoped
  views. Tests prove `loopback_reader` cannot read `public` tables, cannot write, and
  sees no columns beyond the listed ones.
- **Published secrets**: `SESSION_SECRET` and the reader password are demo values in
  `.env.example` and the db image. The README says never to reuse the images with real
  data.
- **Widget secret**: comes from Loopback at runtime through the config file; never
  committed or logged.
- **XSS**: all views escape by default; invoice notes are user input in the demo.
- **Image visibility**: GHCR packages may default to private; the first publish needs a
  one-time switch to public in GitHub settings if Actions can't set it.

## Acceptance checks
| Req | Check |
|-----|-------|
| R1, R4, R5 | Vitest units for proration, retries, limits, totals, dates (correct paths) |
| B1–B5 | `PLANTED_BUGS.md` reviewed; a script reproduces each symptom against the seed |
| R2, R3 | Fastify inject tests: sign in as, each page renders for a seeded customer, sign out |
| R6 | Seed integration: counts, personas present, deterministic across runs |
| R7, R8 | Token test (claims, alg, exp); page with config shows the tag, without it shows the banner |
| R9, R10 | Testcontainers: reader role reads the views, is denied on `public`, writes fail; each named query returns rows for its persona and none for another id |
| R11 | Archive test: lists all articles with valid front matter |
| R12–R14 | CI green; images pullable anonymously from GHCR; `docker compose up` serves :4000 |
