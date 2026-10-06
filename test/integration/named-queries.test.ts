// Each named query returns rows for its persona and none for another id, run as the
// reader role (R10).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './db.js';

interface NamedQuery {
  name: string;
  description: string;
  sql: string;
}

let db: TestDb;
let reader: pg.Client;
let queries: NamedQuery[];

const PERSONA: Record<string, string> = {
  account_overview: 'cus_maple',
  recent_payments: 'cus_fjord',
  billing_invoices: 'cus_lumen',
  recent_invoices: 'cus_kestrel',
};

beforeAll(async () => {
  db = await createTestDb();
  reader = new pg.Client({ connectionString: db.readerUrl });
  await reader.connect();
  const file = fileURLToPath(new URL('../../loopback/named-queries.json', import.meta.url));
  queries = (JSON.parse(await readFile(file, 'utf8')) as { queries: NamedQuery[] }).queries;
});
afterAll(async () => {
  await reader?.end();
  await db?.close();
});

describe('named queries', () => {
  it('has the four documented queries', () => {
    expect(queries.map((q) => q.name)).toEqual([
      'account_overview',
      'recent_payments',
      'billing_invoices',
      'recent_invoices',
    ]);
  });

  it('selects from one support view, scoped by customer_id = $1, with a description', () => {
    for (const query of queries) {
      expect(query.sql, query.name).toMatch(
        /^SELECT \* FROM support\.[a-z_]+ WHERE customer_id = \$1\b/,
      );
      expect(query.sql.match(/support\./g), query.name).toHaveLength(1);
      expect(query.description.length, query.name).toBeGreaterThan(40);
    }
  });

  it('returns rows for its persona and none for another customer', async () => {
    for (const query of queries) {
      const persona = PERSONA[query.name]!;
      const own = await reader.query<{ customer_id: string }>(query.sql, [persona]);
      expect(own.rows.length, query.name).toBeGreaterThan(0);
      expect(new Set(own.rows.map((r) => r.customer_id)), query.name).toEqual(new Set([persona]));

      const none = await reader.query(query.sql, ['cus_does_not_exist']);
      expect(none.rows, query.name).toEqual([]);
    }
  });

  it("shows Fjord's pending retry and Lumen's cancellation in the data", async () => {
    const billing = queries.find((q) => q.name === 'billing_invoices')!;
    const fjord = await reader.query(billing.sql, ['cus_fjord']);
    expect(fjord.rows[0]).toMatchObject({ status: 'open', retry_count: 1 });
    expect(fjord.rows[0].next_retry_at).toBeInstanceOf(Date);

    const lumen = await reader.query(billing.sql, ['cus_lumen']);
    expect(lumen.rows[0]).toMatchObject({ status: 'uncollectible', retry_count: 3 });
  });
});
