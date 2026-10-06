// The daily billing job advances retries and subscription status (R5). Card updates are
// avoided on purpose (planted bug B2).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBillingTick } from '../../src/billing/tick.js';
import { createTestDb, type TestDb } from './db.js';

let db: TestDb;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db?.close();
});

async function fjord() {
  const { rows } = await db.pool.query<{
    status: string;
    invoice_status: string;
    retry_count: number;
    scheduled: number;
  }>(
    `SELECT s.status, b.status AS invoice_status, b.retry_count,
            (SELECT count(*)::int FROM payment_retries r
              WHERE r.billing_invoice_id = b.id AND r.status = 'scheduled') AS scheduled
       FROM customers c
       JOIN subscriptions s ON s.customer_id = c.id
       JOIN billing_invoices b ON b.customer_id = c.id AND b.retry_count > 0
      WHERE c.external_id = 'cus_fjord'`,
  );
  return rows[0]!;
}

describe('billing tick', () => {
  it('does nothing for retries that are not due yet', async () => {
    const result = await runBillingTick(db.pool, new Date());
    expect(result.failed + result.succeeded).toBe(0);
    expect(await fjord()).toMatchObject({ status: 'past_due', retry_count: 1, scheduled: 1 });
  });

  it('runs a due retry, records the failure and schedules the next one', async () => {
    const result = await runBillingTick(db.pool, new Date(Date.now() + 2 * DAY));
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(await fjord()).toMatchObject({
      status: 'past_due',
      invoice_status: 'open',
      retry_count: 2,
      scheduled: 1,
    });
  });

  it('renews subscriptions whose period has ended', async () => {
    const before = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM billing_invoices',
    );
    const result = await runBillingTick(db.pool, new Date(Date.now() + 9 * DAY));
    expect(result.renewed).toBeGreaterThan(0);
    const after = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM billing_invoices',
    );
    expect(after.rows[0]!.n).toBeGreaterThan(before.rows[0]!.n);
  });

  it('cancels the subscription after the third failed retry', async () => {
    await runBillingTick(db.pool, new Date(Date.now() + 8 * DAY));
    expect(await fjord()).toMatchObject({
      status: 'canceled',
      invoice_status: 'uncollectible',
      retry_count: 3,
      scheduled: 0,
    });
  });

  it('marks the subscription active again when a retry succeeds', async () => {
    // Oakridge's next renewal fails on a declining card, then the card starts working.
    await db.pool.query(
      `UPDATE cards SET last4 = '0002' FROM customers c
        WHERE c.id = cards.customer_id AND c.external_id = 'cus_oakridge'`,
    );
    await runBillingTick(db.pool, new Date(Date.now() + 40 * DAY));
    const status = async () =>
      (
        await db.pool.query<{ status: string }>(
          `SELECT s.status FROM subscriptions s JOIN customers c ON c.id = s.customer_id
            WHERE c.external_id = 'cus_oakridge'`,
        )
      ).rows[0]!.status;
    expect(await status()).toBe('past_due');

    await db.pool.query(
      `UPDATE cards SET last4 = '4242' FROM customers c
        WHERE c.id = cards.customer_id AND c.external_id = 'cus_oakridge'`,
    );
    await runBillingTick(db.pool, new Date(Date.now() + 42 * DAY));
    expect(await status()).toBe('active');
  });
});
