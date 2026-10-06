import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeedSql } from '../../scripts/seed/build.js';
import { createTestDb, type TestDb } from './db.js';

let first: TestDb;
let second: TestDb;

beforeAll(async () => {
  [first, second] = await Promise.all([createTestDb(), createTestDb()]);
});
afterAll(async () => {
  await Promise.all([first?.close(), second?.close()]);
});

async function count(db: TestDb, sql: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(`SELECT (${sql})::int AS n`);
  return rows[0]!.n;
}

describe('seed', () => {
  it('matches the generator output (run pnpm seed:generate after changing it)', async () => {
    const committed = await readFile(
      fileURLToPath(new URL('../../db/seed.sql', import.meta.url)),
      'utf8',
    );
    expect(buildSeedSql()).toBe(committed);
    expect(buildSeedSql()).toBe(buildSeedSql());
  });

  it('has 12 customers across plans and countries', async () => {
    expect(await count(first, 'SELECT count(*) FROM customers')).toBe(12);
    const { rows } = await first.pool.query<{ plan_id: string; n: number }>(
      `SELECT plan_id, count(*)::int AS n FROM subscriptions GROUP BY plan_id ORDER BY plan_id`,
    );
    expect(rows.map((r) => r.plan_id)).toEqual(['business', 'pro', 'starter']);
    const countries = await first.pool.query<{ country: string }>(
      'SELECT DISTINCT country FROM customers',
    );
    expect(countries.rows.map((r) => r.country)).toEqual(
      expect.arrayContaining(['DE', 'FR', 'ES', 'SI', 'US']),
    );
  });

  it('has about 300 invoices and 6 months of billing history', async () => {
    const invoices = await count(first, 'SELECT count(*) FROM invoices');
    expect(invoices).toBeGreaterThanOrEqual(270);
    expect(invoices).toBeLessThanOrEqual(330);
    expect(
      await count(
        first,
        `SELECT count(*) FROM billing_invoices WHERE created_at < now() - interval '5 months'`,
      ),
    ).toBeGreaterThan(0);
    expect(await count(first, `SELECT count(*) FROM payments WHERE status = 'failed'`)).toBeGreaterThan(
      0,
    );
    expect(await count(first, 'SELECT count(*) FROM payment_retries')).toBeGreaterThan(0);
  });

  it('has the named personas in their documented state', async () => {
    const { rows } = await first.pool.query<{ external_id: string; plan_id: string; status: string }>(
      `SELECT c.external_id, s.plan_id, s.status FROM customers c
         JOIN subscriptions s ON s.customer_id = c.id`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.external_id, r]));
    expect(byId.cus_maple).toMatchObject({ plan_id: 'starter', status: 'active' });
    expect(byId.cus_alder).toMatchObject({ plan_id: 'business', status: 'active' });
    expect(byId.cus_fjord).toMatchObject({ plan_id: 'pro', status: 'past_due' });
    expect(byId.cus_lumen).toMatchObject({ plan_id: 'pro', status: 'canceled' });
    expect(byId.cus_kestrel).toMatchObject({ plan_id: 'business', status: 'active' });
    expect(byId.cus_tidewater).toMatchObject({ plan_id: 'pro', status: 'active' });
    expect(byId.cus_sable).toMatchObject({ plan_id: 'business', status: 'active' });
  });

  it("puts Maple's recent invoices in the current month", async () => {
    expect(
      await count(
        first,
        `SELECT count(*) FROM invoices i JOIN customers c ON c.id = i.customer_id
          WHERE c.external_id = 'cus_maple' AND i.created_at >= date_trunc('month', now())`,
      ),
    ).toBe(5);
  });

  it('has a future retry pending for Fjord', async () => {
    expect(
      await count(
        first,
        `SELECT count(*) FROM payment_retries r JOIN customers c ON c.id = r.customer_id
          WHERE c.external_id = 'cus_fjord' AND r.status = 'scheduled' AND r.scheduled_for > now()`,
      ),
    ).toBe(1);
  });

  it('loads the same data every time, relative to load time', async () => {
    const tables = ['customers', 'cards', 'subscriptions', 'billing_invoices', 'payments',
      'payment_retries', 'invoices', 'invoice_lines'];
    for (const table of tables) {
      const [a, b] = await Promise.all(
        [first, second].map(async (db) => {
          const anchor = await db.pool.query<{ t: Date }>(
            'SELECT min(created_at) AS t FROM customers',
          );
          const base = anchor.rows[0]!.t.getTime();
          const { rows } = await db.pool.query(`SELECT * FROM ${table} ORDER BY 1`);
          return rows.map((row: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [
                k,
                // Minutes from load time: "this month" rows are anchored to the month
                // start rather than now(), so they shift by the gap between the loads.
                v instanceof Date
                  ? Math.round((v.getTime() - base) / 60_000)
                  : k.endsWith('_date')
                    ? null
                    : v,
              ]),
            ),
          );
        }),
      );
      expect(b, table).toEqual(a);
    }
  });
});
