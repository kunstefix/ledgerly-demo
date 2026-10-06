// Shows each planted bug (PLANTED_BUGS.md) against a freshly seeded database:
// `pnpm bugs:repro` (uses DATABASE_URL, default: the compose db on localhost:5433).
//
// The "expected" values are computed here, independently of the buggy modules.

import { formatDueDate } from '../src/invoices/dates.js';
import { checkInvoiceLimit, monthStart } from '../src/invoices/limits.js';
import { prorationAmount } from '../src/billing/proration.js';
import { afterCardUpdated, afterFailedRetry } from '../src/billing/retries.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';
import { getCustomerByExternalId } from '../src/db/queries/customers.js';
import { invoicesCreatedSince } from '../src/db/queries/invoices.js';

const pool = createPool(loadConfig().databaseUrl);
let reproduced = 0;

function report(id: string, title: string, actual: string, expected: string): void {
  const ok = actual !== expected;
  if (ok) reproduced++;
  console.log(`\n${ok ? '✗' : '?'} ${id}: ${title}`);
  console.log(`    Ledgerly: ${actual}`);
  console.log(`    Expected: ${expected}`);
}

async function customerId(externalId: string): Promise<number> {
  const customer = await getCustomerByExternalId(pool, externalId);
  if (!customer) throw new Error(`${externalId} missing: is the database seeded?`);
  return customer.id;
}

async function b1(): Promise<void> {
  const id = await customerId('cus_alder');
  const { rows } = await pool.query<{ amount: number; at: Date; start: Date; end: Date }>(
    `SELECT b.amount_cents AS amount, b.created_at AS at,
            s.current_period_start AS start, s.current_period_end AS "end"
       FROM billing_invoices b JOIN subscriptions s ON s.customer_id = b.customer_id
      WHERE b.customer_id = $1 AND b.description LIKE 'Upgrade%'`,
    [id],
  );
  const row = rows[0]!;
  const change = {
    currentPriceCents: 2900,
    newPriceCents: 9900,
    periodStart: row.start,
    periodEnd: row.end,
    changeAt: row.at,
  };
  const remaining =
    (row.end.getTime() - row.at.getTime()) / (row.end.getTime() - row.start.getTime());
  const expected = Math.round(7000 * remaining);
  report(
    'B1',
    'cus_alder upgraded Pro → Business with a few days left and was overcharged',
    `charged €${(row.amount / 100).toFixed(2)} (proration.ts says €${(prorationAmount(change) / 100).toFixed(2)})`,
    `€${(expected / 100).toFixed(2)}: €70 difference × ${(remaining * 100).toFixed(0)}% of the period left`,
  );
}

async function b2(): Promise<void> {
  const id = await customerId('cus_lumen');
  const { rows } = await pool.query<{ status: string; failure_code: string; card_last4: string }>(
    `SELECT status, failure_code, card_last4 FROM payments
      WHERE customer_id = $1 ORDER BY attempted_at DESC LIMIT 4`,
    [id],
  );
  const now = new Date();
  const updated = afterCardUpdated({ retryCount: 2, startedAt: now }, now);
  const next = afterFailedRetry(updated).next;
  report(
    'B2',
    'cus_lumen updated their card after 2 failed retries and was canceled on the next failure',
    `subscription canceled right after the first payment on the new card (…${rows[0]?.card_last4}) ` +
      `failed; retries.ts keeps retryCount=${updated.retryCount} and then decides "${next.action}"`,
    'the retry counter resets on card update: next decision "retry" (attempt 1 of a fresh schedule)',
  );
}

async function b3(): Promise<void> {
  const id = await customerId('cus_maple');
  const now = new Date();
  const invoices = await invoicesCreatedSince(pool, id, monthStart(now));
  const check = checkInvoiceLimit(invoices, 5, now);
  const issued = invoices.filter((i) => i.status !== 'draft' && i.deletedAt === null).length;
  report(
    'B3',
    'cus_maple (Starter) is told the monthly limit is reached',
    `${check.used} of 5 used, can create: ${check.allowed}`,
    `${issued} of 5 used (1 draft and 1 deleted invoice don't count), can create: ${issued < 5}`,
  );
}

async function b4(): Promise<void> {
  const id = await customerId('cus_kestrel');
  const { rows } = await pool.query<{
    number: string;
    subtotal: number;
    vat: number;
    expected: number;
  }>(
    `SELECT i.number, i.subtotal_cents AS subtotal, i.vat_cents AS vat,
            round(i.subtotal_cents * max(l.vat_rate_bps) / 10000.0)::int AS expected
       FROM invoices i JOIN invoice_lines l ON l.invoice_id = i.id
      WHERE i.customer_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.id HAVING count(DISTINCT l.vat_rate_bps) = 1
         AND i.vat_cents <> round(i.subtotal_cents * max(l.vat_rate_bps) / 10000.0)::int
      ORDER BY i.created_at DESC`,
    [id],
  );
  const first = rows[0];
  report(
    'B4',
    `cus_kestrel: VAT is a cent off on ${rows.length} invoice(s)`,
    first
      ? `${first.number}: subtotal €${(first.subtotal / 100).toFixed(2)}, VAT €${(first.vat / 100).toFixed(2)}`
      : 'no affected invoice found',
    first
      ? `VAT 19% × €${(first.subtotal / 100).toFixed(2)} = €${(first.expected / 100).toFixed(2)}`
      : 'no affected invoice found',
  );
}

async function b5(): Promise<void> {
  const id = await customerId('cus_tidewater');
  const { rows } = await pool.query<{ number: string; due: string }>(
    `SELECT number, due_date AS due FROM invoices
      WHERE customer_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [id],
  );
  const { number, due } = rows[0]!;
  const [y, m, d] = due.split('-').map(Number);
  const expected = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  report(
    'B5',
    `cus_tidewater (New York): ${number} is due ${due}`,
    `shows "${formatDueDate(due, 'America/New_York')}"`,
    `"${expected}"`,
  );
}

try {
  console.log('Planted bugs against the seeded database (see PLANTED_BUGS.md)');
  await b1();
  await b2();
  await b3();
  await b4();
  await b5();
  console.log(`\n${reproduced} of 5 bugs reproduced.`);
  process.exitCode = reproduced === 5 ? 0 : 1;
} finally {
  await pool.end();
}
