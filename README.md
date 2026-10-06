# Ledgerly (demo)

Ledgerly is a small invoicing SaaS. Small businesses use it to send invoices to their
clients, and pay Ledgerly a subscription. It's **deliberately imperfect**: it exists only as
the demo customer of [Loopback](https://github.com/kunstefix/loopback), an open-source AI
support platform.

Everything here is fake: customers, invoices, payments and cards are seed fixtures. Demo
passwords and secrets are published on purpose. **Never reuse this code or these images
with real data.**

## Run it

```sh
docker compose up --build
```

Open http://localhost:4000, pick a customer and click **Sign in as**. There are no
passwords.

For development (Node 24, pnpm via corepack):

```sh
corepack enable
pnpm install --frozen-lockfile
docker compose up -d db      # seeded Postgres on localhost:5433
cp .env.example .env         # optional; the defaults match the compose db
pnpm dev                     # http://localhost:4000
```

| Command              | What it does                                                       |
| -------------------- | ------------------------------------------------------------------ |
| `pnpm verify`        | Lint, typecheck, unit and integration tests (Docker), format check |
| `pnpm build`         | Compile to `dist/`                                                 |
| `pnpm seed:generate` | Regenerate `db/seed.sql` from `scripts/seed/`                      |
| `pnpm billing:tick`  | Run the daily billing job once (renewals and payment retries)      |
| `pnpm bugs:repro`    | Show the planted bugs against the seeded database                  |

The billing job can also be run from **Internal tools** (`/internal`) in the app.

## Demo customers

| Customer        | Plan                    | Shows                                               |
| --------------- | ----------------------- | --------------------------------------------------- |
| `cus_maple`     | Starter, Toronto        | B3: "limit reached" after 3 sent invoices           |
| `cus_alder`     | Business, Slovenia      | B1: overcharged for a late-period upgrade           |
| `cus_fjord`     | Pro, Norway             | A `card_declined` payment with retry 2 of 3 pending |
| `cus_lumen`     | Pro, Spain              | B2: canceled right after updating their card        |
| `cus_kestrel`   | Business, Germany       | B4: VAT a cent off on a two-line invoice            |
| `cus_tidewater` | Pro, New York           | B5: due dates a day early                           |
| `cus_sable`     | Business annual, France | "When is my next payment and how much?"             |

Five more customers fill in the background. The seed is deterministic. Every timestamp is
relative to the moment the database is created, so "this month" and pending retries always
make sense. The planted bugs are documented in [PLANTED_BUGS.md](PLANTED_BUGS.md).

## How Loopback connects

Loopback connects only through public integration points. **This contract is public API:
changing it breaks Loopback's demo profile.**

- **Code.** Loopback indexes this public repository. Business rules live in small modules:
  `src/billing/{proration,retries,failure-codes}.ts` and
  `src/invoices/{limits,totals,dates}.ts`.
- **Widget.** Every signed-in page includes

  ```html
  <script
    src="{apiPublicUrl}/widget.js"
    data-loopback-widget="{widgetConnectionId}"
    data-customer-token="{jwt}"
    async
  ></script>
  ```

  The JWT is HS256, signed with the connection's identity secret. Its claims are `sub` (the
  customer's external id, `cus_…`), `email` and `name`, and it expires 1 hour after it's
  issued.

- **Settings.** Read on every request from the JSON file at `LOOPBACK_CONFIG_FILE`, with
  the keys `apiPublicUrl`, `widgetConnectionId`, `identitySecret` and optionally
  `helpCenterUrl`. In Compose that's `./config/loopback.json`, which Loopback's
  `demo-setup` writes. The env vars `LOOPBACK_API_PUBLIC_URL`,
  `LOOPBACK_WIDGET_CONNECTION_ID`, `LOOPBACK_IDENTITY_SECRET` and
  `LOOPBACK_HELP_CENTER_URL` override the file. If the settings are missing or invalid,
  there's no widget and a banner says support chat isn't configured.
- **Database.** Schema `support` has four views: `customer_account`, `billing_invoices`,
  `payments` and `recent_invoices`. Each has a `customer_id` column holding the external
  id. Role `loopback_reader` (password `loopback_reader_demo`) can read only these views.
  It's read-only by default and has no access to `public`. See `db/support.sql`.
- **Named queries.** `loopback/named-queries.json`, also served at
  `GET /loopback/named-queries.json`.
- **Help center.** `help/*.md`, with front matter `title`, `slug`, `visibility` and
  `collection`. Also served as an archive at `GET /loopback/help-export.tar.gz`.
- **Health.** `GET /healthz`.

## Images

GitHub Actions publishes both images on every push to `master`, for `linux/amd64` and
`linux/arm64`, tagged `latest` and with the commit sha:

- `ghcr.io/kunstefix/ledgerly-demo`: the app, on port 4000
- `ghcr.io/kunstefix/ledgerly-demo-db`: Postgres 17 with schema, seed, support views and
  the reader role (database `ledgerly`, user `ledgerly`, password `ledgerly_demo`)

GHCR creates new packages as private. After the first publish, make both packages
**public** once (package settings → Change visibility), so Loopback's demo profile can
pull them anonymously.

## Licence

MIT
