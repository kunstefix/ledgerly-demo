# Planted bugs

Ledgerly is deliberately imperfect. These five bugs are intentional: they give demo
customers something real to report, and Loopback's agent something real to find in the
code. **Don't fix them.**

Each one contradicts the help center (`help/`), as real bugs do. Each affects at least one
seeded customer. Tests never assert the buggy path: each affected test file says which
bug it avoids. Run `pnpm bugs:repro` against a freshly seeded database to see all five.

| Bug | Customer reports                   | File                          | Seeded customer |
| --- | ---------------------------------- | ----------------------------- | --------------- |
| B1  | Upgrade charge is too high         | `src/billing/proration.ts:25` | `cus_alder`     |
| B2  | Canceled right after updating card | `src/billing/retries.ts:41`   | `cus_lumen`     |
| B3  | Invoice limit reached too early    | `src/invoices/limits.ts:24`   | `cus_maple`     |
| B4  | VAT is a cent off                  | `src/invoices/totals.ts:26`   | `cus_kestrel`   |
| B5  | Due dates a day early              | `src/invoices/dates.ts:13`    | `cus_tidewater` |

## B1: upgrades late in the period are overcharged

- **Symptom.** "I upgraded from Pro to Business with about a week left and was charged
  €56. Your help page says I'd only pay the difference for the days left, so about €14."
- **Where.** `src/billing/proration.ts:25`. It computes the **elapsed** fraction of the
  period (`changeAt - periodStart`) where it should use the **remaining** fraction
  (`periodEnd - changeAt`). An upgrade near the end of a period is charged almost the full
  price difference. One near the start is charged almost nothing.
- **Correct.** `amount = (new price − current price) × (periodEnd − changeAt) / (periodEnd − periodStart)`.
  The file's header comment says so.
- **Seeded.** `cus_alder` (Alder Analytics) upgraded Pro → Business 24 days into a ~30-day
  period. Billing invoice "Upgrade from Pro to Business (prorated)" is ≈ €56 instead of
  ≈ €14.
- **Help center.** `changing-plans.md` (worked example: 6 days left → $14).

## B2: updating the card doesn't reset the retry counter

- **Symptom.** "My card expired, two retries failed, so I added a new card. That payment
  failed too and you canceled my subscription immediately. Your help page says updating
  the card gives me a fresh set of retries."
- **Where.** `src/billing/retries.ts:41`. `afterCardUpdated` keeps `state.retryCount` and
  only moves `startedAt`. After two failed retries, the immediate retry with the new card is
  counted as the third, and a failure cancels the subscription.
- **Correct.** Return `{ retryCount: 0, startedAt: now }`. The schedule restarts, and a
  failure with the new card gets 3 more retries over 7 days.
- **Seeded.** `cus_lumen` (Lumen Estudio): three `expired_card` failures on card …3220,
  new card …9995 added, one `insufficient_funds` failure, subscription canceled the same
  minute. Its billing invoice is uncollectible with `retry_count = 3`.
- **Help center.** `failed-payments-and-retries.md`, `updating-your-card.md`.

## B3: drafts and deleted invoices count toward the monthly limit

- **Symptom.** "I'm on Starter and have only sent 3 invoices this month, but Ledgerly says
  I've reached my limit of 5."
- **Where.** `src/invoices/limits.ts:24`. `countsTowardLimit` only checks the creation
  month. It ignores `status` and `deletedAt`, so drafts and deleted invoices are counted.
- **Correct.** Count invoices created this month (UTC) that are not drafts and not
  deleted: `status !== 'draft' && deletedAt === null`.
- **Seeded.** `cus_maple` (Maple & Moss Design, Starter): this month, 3 sent, 1 draft and
  1 deleted. The dashboard shows 5 / 5 and "New invoice" is blocked. Loopback's
  `account_overview` query (`invoices_issued_this_month`) counts correctly and returns 3,
  so the data contradicts the app.
- **Help center.** `plans-and-limits.md`, `sending-and-deleting-invoices.md`.

## B4: VAT is rounded per line instead of per invoice

- **Symptom.** "Invoice INV-0059 has €25.00 net at 19%. That's €4.75 VAT, but Ledgerly
  says €4.76."
- **Where.** `src/invoices/totals.ts:26`. VAT is rounded on each line and the rounded
  amounts are summed.
- **Correct.** Sum the net amounts per VAT rate and round VAT once per rate, on the
  subtotal (half up).
- **Seeded.** `cus_kestrel` (Kestrel Kaffee): INV-0059 has two lines of €12.50 at 19%,
  VAT €4.76 instead of €4.75. Several other multi-line Kestrel invoices are also a cent
  off. Totals are stored when an invoice is created, so the seed carries the same error.
- **Help center.** `vat-on-invoices.md` (worked example: 2 × €12.50 → €4.75).

## B5: due dates show one day early west of UTC

- **Symptom.** "My client in New York says the invoice is due on the 1st, but my
  dashboard shows the 31st."
- **Where.** `src/invoices/dates.ts:13`. `formatDueDate` parses the calendar date with
  `new Date("YYYY-MM-DD")`, which is midnight UTC, then formats it in the customer's
  timezone. West of UTC, midnight UTC falls on the previous day.
- **Correct.** Treat the due date as a calendar date. Format it without converting
  timezones, for example from `Date.UTC(y, m - 1, d)` with `timeZone: 'UTC'`.
- **Seeded.** `cus_tidewater` (Tidewater Consulting, `America/New_York`). Every issue and
  due date shows a day early. `cus_maple` (Toronto), `cus_oakridge` (Chicago) and
  `cus_quarry` (Denver) see it too.
- **Help center.** `due-dates.md`.
