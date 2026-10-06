// The loopback_reader role can read the support views and nothing else (R9).
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db.js';

let db: TestDb;
let reader: pg.Client;

const VIEW_COLUMNS: Record<string, string[]> = {
  customer_account: [
    'customer_id',
    'company_name',
    'contact_name',
    'contact_email',
    'country',
    'timezone',
    'currency',
    'plan',
    'plan_name',
    'monthly_invoice_limit',
    'billing_interval',
    'subscription_status',
    'current_period_start',
    'current_period_end',
    'canceled_at',
    'plan_price_cents',
    'invoices_issued_this_month',
    'card_brand',
    'card_last4',
    'card_exp_month',
    'card_exp_year',
    'customer_since',
  ],
  billing_invoices: [
    'customer_id',
    'number',
    'description',
    'amount_cents',
    'currency',
    'status',
    'period_start',
    'period_end',
    'retry_count',
    'next_retry_at',
    'created_at',
  ],
  payments: [
    'customer_id',
    'billing_invoice_number',
    'amount_cents',
    'currency',
    'status',
    'failure_code',
    'retry_attempt',
    'card_last4',
    'attempted_at',
  ],
  recent_invoices: [
    'customer_id',
    'number',
    'client_name',
    'issue_date',
    'due_date',
    'status',
    'currency',
    'subtotal_cents',
    'vat_cents',
    'total_cents',
    'line_count',
    'created_at',
    'sent_at',
    'paid_at',
    'deleted_at',
  ],
};

beforeAll(async () => {
  db = await createTestDb();
  reader = new pg.Client({ connectionString: db.readerUrl });
  await reader.connect();
});
afterAll(async () => {
  await reader?.end();
  await db?.close();
});

describe('loopback_reader', () => {
  it('reads each support view with exactly the listed columns', async () => {
    for (const [view, columns] of Object.entries(VIEW_COLUMNS)) {
      const result = await reader.query(`SELECT * FROM support.${view} LIMIT 5`);
      expect(result.rows.length, view).toBeGreaterThan(0);
      expect(
        result.fields.map((f) => f.name),
        view,
      ).toEqual(columns);
    }
  });

  it('sees only these four views in the support schema', async () => {
    const { rows } = await db.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'support' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(Object.keys(VIEW_COLUMNS).sort());
  });

  it('exposes no client emails, notes or full card data', async () => {
    const all = Object.values(VIEW_COLUMNS).flat();
    for (const banned of ['client_email', 'notes', 'number_full', 'cvc', 'card_number']) {
      expect(all).not.toContain(banned);
    }
  });

  it('cannot read public tables', async () => {
    for (const table of ['customers', 'invoices', 'cards', 'payments', 'plans']) {
      await expect(reader.query(`SELECT 1 FROM public.${table} LIMIT 1`), table).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('cannot write, even through the views or with read-only switched off', async () => {
    await expect(
      reader.query(`UPDATE support.customer_account SET company_name = 'x'`),
    ).rejects.toThrow();
    await expect(reader.query('CREATE TABLE support.x (id int)')).rejects.toThrow();
    await expect(reader.query('CREATE TEMP TABLE x (id int)')).rejects.toThrow();

    await reader.query('SET default_transaction_read_only = off');
    try {
      await expect(
        reader.query(`DELETE FROM support.payments WHERE customer_id = 'cus_fjord'`),
      ).rejects.toThrow();
      await expect(reader.query(`INSERT INTO public.plans (id) VALUES ('x')`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await reader.query('RESET default_transaction_read_only');
    }
    const fjord = await reader.query(
      `SELECT count(*)::int AS n FROM support.payments WHERE customer_id = 'cus_fjord'`,
    );
    expect(fjord.rows[0].n).toBeGreaterThan(0);
  });

  it('is read-only by default', async () => {
    const { rows } = await reader.query<{ default_transaction_read_only: string }>(
      'SHOW default_transaction_read_only',
    );
    expect(rows[0]?.default_transaction_read_only).toBe('on');
  });
});
