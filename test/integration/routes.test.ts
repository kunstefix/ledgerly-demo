// Sign in as, every page for every seeded customer, the invoice and billing forms, and
// sign out (R2, R3, R13). Paths touched by planted bugs are avoided on purpose.
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestDb, signIn, type TestDb } from './db.js';

let db: TestDb;
let app: FastifyInstance;

beforeAll(async () => {
  db = await createTestDb();
  app = await createTestApp(db);
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});

const form = (fields: Record<string, string>) => ({
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  payload: new URLSearchParams(fields).toString(),
});

async function get(url: string, cookie: string) {
  return app.inject({ method: 'GET', url, headers: { cookie } });
}

async function post(url: string, cookie: string, fields: Record<string, string> = {}) {
  const { headers, payload } = form(fields);
  return app.inject({ method: 'POST', url, headers: { ...headers, cookie }, payload });
}

function invoiceFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    clientName: 'Northwind Bakery',
    clientEmail: 'accounts@northwind-bakery.example',
    issueDate: '2026-10-01',
    dueInDays: '14',
    notes: '',
    line0Description: 'Consulting',
    line0Quantity: '2',
    line0UnitPrice: '100.00',
    line0VatRate: '0',
    ...overrides,
  };
}

describe('sign in as', () => {
  it('lists every seeded customer with a sign-in button', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('no passwords');
    expect(response.body.match(/name="customer"/g)).toHaveLength(12);
    expect(response.body).toContain('cus_maple');
  });

  it('redirects to the sign-in page when signed out or with a forged cookie', async () => {
    for (const url of ['/dashboard', '/invoices', '/billing', '/invoices/new']) {
      expect((await app.inject({ method: 'GET', url })).headers.location, url).toBe('/');
    }
    const forged = await get('/dashboard', 'ledgerly_session=cus_maple');
    expect(forged.headers.location).toBe('/');
  });

  it('ignores unknown customers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/session',
      ...form({ customer: 'cus_nobody' }),
    });
    expect(response.headers.location).toBe('/');
    expect(response.cookies.find((c) => c.name === 'ledgerly_session')).toBeUndefined();
  });

  it('sets an HttpOnly, SameSite=Lax cookie and signs out', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/session',
      ...form({ customer: 'cus_sable' }),
    });
    const cookie = response.cookies.find((c) => c.name === 'ledgerly_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(response.headers.location).toBe('/dashboard');

    const out = await post('/session/delete', `ledgerly_session=${cookie.value}`);
    expect(out.headers.location).toBe('/');
    expect(out.cookies.find((c) => c.name === 'ledgerly_session')?.value).toBe('');
  });
});

describe('pages', () => {
  it('renders every page for every seeded customer', async () => {
    const { rows } = await db.pool.query<{ external_id: string }>(
      'SELECT external_id FROM customers ORDER BY id',
    );
    expect(rows).toHaveLength(12);
    for (const { external_id } of rows) {
      const cookie = await signIn(app, external_id);
      for (const url of [
        '/dashboard',
        '/invoices',
        '/invoices/new',
        '/billing',
        '/billing/plan',
        '/billing/card',
        '/internal',
      ]) {
        const response = await get(url, cookie);
        expect(response.statusCode, `${external_id} ${url}`).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
      }
      const first = await get('/invoices/INV-0001', cookie);
      expect([200, 404], external_id).toContain(first.statusCode);
    }
  });

  it('shows the plan, usage and next payment on the dashboard', async () => {
    const cookie = await signIn(app, 'cus_sable');
    const body = (await get('/dashboard', cookie)).body;
    expect(body).toContain('Sable &amp; Fils SARL');
    expect(body).toContain('Business');
    expect(body).toContain('€990.00');
    expect(body).toContain('Next payment');
  });

  it('shows failed payments with plain explanations on billing', async () => {
    const cookie = await signIn(app, 'cus_fjord');
    const body = (await get('/billing', cookie)).body;
    expect(body).toContain('card_declined');
    expect(body).toContain('Your bank declined the payment');
    expect(body).toContain('Retry 2 of 3 is scheduled');
  });

  it("doesn't show another customer's invoice", async () => {
    const cookie = await signIn(app, 'cus_quarry');
    const { rows } = await db.pool.query<{ number: string }>(
      `SELECT i.number FROM invoices i JOIN customers c ON c.id = i.customer_id
        WHERE c.external_id = 'cus_kestrel' ORDER BY i.number DESC LIMIT 1`,
    );
    expect((await get(`/invoices/${rows[0]!.number}`, cookie)).statusCode).toBe(404);
  });

  it('serves the stylesheet and health check', async () => {
    expect((await app.inject({ method: 'GET', url: '/static/styles.css' })).statusCode).toBe(200);
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.json()).toEqual({ ok: true });
  });
});

describe('invoices', () => {
  it('creates, escapes, sends and deletes an invoice', async () => {
    const cookie = await signIn(app, 'cus_brightline');
    const created = await post(
      '/invoices',
      cookie,
      invoiceFields({ notes: '<script>alert("pwned")</script>', clientName: 'A & B <Co>' }),
    );
    expect(created.statusCode).toBe(302);
    const url = created.headers.location!.split('?')[0]!;
    expect(url).toMatch(/^\/invoices\/INV-\d{4}$/);

    const page = (await get(url, cookie)).body;
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;');
    expect(page).toContain('A &amp; B &lt;Co&gt;');
    expect(page).toContain('€200.00');
    expect(page).toContain('Oct 15, 2026');

    await post(`${url}/send`, cookie);
    expect((await get(url, cookie)).body).toContain('badge-sent');

    await post(`${url}/delete`, cookie);
    expect((await get(url, cookie)).statusCode).toBe(404);
  });

  it('rejects invalid input with a message', async () => {
    const cookie = await signIn(app, 'cus_brightline');
    const response = await post('/invoices', cookie, invoiceFields({ line0UnitPrice: 'abc' }));
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('Line 1 needs a price');
    const noEmail = await post('/invoices', cookie, invoiceFields({ clientEmail: 'nope' }));
    expect(noEmail.body).toContain('valid client email');
  });

  it('blocks Starter customers after 5 issued invoices this month', async () => {
    // Pinecrest starts the month with one sent invoice. Each new invoice is sent right
    // away, so drafts never pile up.
    const cookie = await signIn(app, 'cus_pinecrest');
    for (let i = 0; i < 4; i++) {
      const created = await post('/invoices', cookie, invoiceFields());
      expect(created.statusCode, `invoice ${i + 2}`).toBe(302);
      await post(`${created.headers.location!.split('?')[0]}/send`, cookie);
    }
    const blocked = await post('/invoices', cookie, invoiceFields());
    expect(blocked.statusCode).toBe(422);
    expect(blocked.body).toContain('limit of 5 invoices this month');
  });
});

describe('billing', () => {
  it('charges a prorated amount for an upgrade', async () => {
    const cookie = await signIn(app, 'cus_quarry');
    const response = await post('/billing/plan', cookie, { plan: 'business' });
    expect(response.headers.location).toBe('/billing?notice=plan-charged');
    const { rows } = await db.pool.query<{ amount_cents: number; status: string }>(
      `SELECT b.amount_cents, b.status FROM billing_invoices b
         JOIN customers c ON c.id = b.customer_id
        WHERE c.external_id = 'cus_quarry' ORDER BY b.id DESC LIMIT 1`,
    );
    expect(rows[0]!.status).toBe('paid');
    expect(rows[0]!.amount_cents).toBeGreaterThan(0);
    expect(rows[0]!.amount_cents).toBeLessThanOrEqual(9900 - 2900);
  });

  it('credits unused time for a downgrade', async () => {
    const cookie = await signIn(app, 'cus_kestrel');
    const response = await post('/billing/plan', cookie, { plan: 'pro' });
    expect(response.headers.location).toBe('/billing?notice=plan-credited');
    const { rows } = await db.pool.query<{ amount_cents: number; plan_id: string }>(
      `SELECT b.amount_cents, s.plan_id FROM billing_invoices b
         JOIN subscriptions s ON s.customer_id = b.customer_id
         JOIN customers c ON c.id = b.customer_id
        WHERE c.external_id = 'cus_kestrel' ORDER BY b.id DESC LIMIT 1`,
    );
    expect(rows[0]!.plan_id).toBe('pro');
    expect(rows[0]!.amount_cents).toBeLessThan(0);
  });

  it('restarts a canceled subscription with a full payment', async () => {
    const cookie = await signIn(app, 'cus_meridian');
    const response = await post('/billing/plan', cookie, { plan: 'pro' });
    expect(response.headers.location).toBe('/billing?notice=plan-charged');
    const { rows } = await db.pool.query<{ status: string }>(
      `SELECT s.status FROM subscriptions s JOIN customers c ON c.id = s.customer_id
        WHERE c.external_id = 'cus_meridian'`,
    );
    expect(rows[0]!.status).toBe('active');
  });

  it('rejects an invalid card', async () => {
    const cookie = await signIn(app, 'cus_fjord');
    const response = await post('/billing/card', cookie, {
      name: 'Ingrid',
      number: '4242 4242 4242 4241',
      expMonth: '12',
      expYear: '2030',
      cvc: '123',
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('doesn&#39;t look right');
  });

  it('retries the failed payment right away with a working new card', async () => {
    const cookie = await signIn(app, 'cus_fjord');
    const response = await post('/billing/card', cookie, {
      name: 'Ingrid Fjeld',
      number: '4242 4242 4242 4242',
      expMonth: '12',
      expYear: '2030',
      cvc: '123',
    });
    expect(response.headers.location).toBe('/billing?notice=card-retry-ok');
    const { rows } = await db.pool.query<{ status: string; last4: string; open: number }>(
      `SELECT s.status, k.last4,
              (SELECT count(*)::int FROM billing_invoices b
                WHERE b.customer_id = c.id AND b.status = 'open') AS open
         FROM customers c
         JOIN subscriptions s ON s.customer_id = c.id
         JOIN cards k ON k.customer_id = c.id
        WHERE c.external_id = 'cus_fjord'`,
    );
    expect(rows[0]).toEqual({ status: 'active', last4: '4242', open: 0 });
  });
});
