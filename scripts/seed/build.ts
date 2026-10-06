// Builds db/seed.sql. Deterministic: the same code always produces the same SQL text.
// Every timestamp is relative to the moment the seed is loaded (see At in sql.ts), so
// "this month", pending retries and due dates stay meaningful whenever the db starts.

import { invoiceTotals, type LineInput } from '../../src/invoices/totals.js';
import { CLIENTS, CUSTOMERS, type CustomerSpec } from './customers.js';
import { At, insert, random, Raw, type Value } from './sql.js';

const PRICES = {
  starter: { month: 0, year: 0 },
  pro: { month: 2900, year: 29000 },
  business: { month: 9900, year: 99000 },
} as const;
const PLAN_NAMES = { starter: 'Starter', pro: 'Pro', business: 'Business' } as const;
const MONTHLY_PERIODS = 6;

interface Line extends LineInput {
  description: string;
}

class Seed {
  customers: Value[][] = [];
  cards: Value[][] = [];
  subscriptions: Value[][] = [];
  billingInvoices: Value[][] = [];
  payments: Value[][] = [];
  retries: Value[][] = [];
  invoices: Value[][] = [];
  lines: Value[][] = [];
  private billingNumber = 10000;

  billingInvoice(
    c: CustomerSpec,
    row: {
      description: string;
      amount: number | Raw;
      status: 'paid' | 'open' | 'uncollectible';
      start: At;
      end: At;
      createdAt: At;
      retryCount?: number;
      dunningStartedAt?: At;
    },
  ): number {
    const id = this.billingInvoices.length + 1;
    this.billingNumber++;
    this.billingInvoices.push([
      id,
      `LB-${this.billingNumber}`,
      c.id,
      row.description,
      row.amount,
      c.currency,
      row.status,
      row.start,
      row.end,
      row.retryCount ?? 0,
      row.dunningStartedAt ?? null,
      row.createdAt,
    ]);
    return id;
  }

  payment(
    c: CustomerSpec,
    billingInvoiceId: number,
    amount: number | Raw,
    at: At,
    last4: string,
    failureCode: string | null = null,
  ): number {
    const id = this.payments.length + 1;
    this.payments.push([
      id,
      billingInvoiceId,
      c.id,
      amount,
      c.currency,
      failureCode ? 'failed' : 'succeeded',
      failureCode,
      last4,
      at,
    ]);
    return id;
  }

  retry(
    c: CustomerSpec,
    billingInvoiceId: number,
    attempt: number,
    scheduledFor: At,
    status: 'scheduled' | 'succeeded' | 'failed' | 'canceled',
    paymentId: number | null,
    createdAt: At,
  ): void {
    this.retries.push([
      this.retries.length + 1,
      billingInvoiceId,
      c.id,
      attempt,
      scheduledFor,
      status,
      paymentId,
      createdAt,
    ]);
  }

  billingNumberSeq(): number {
    return this.billingNumber;
  }
}

function periodStart(anchor: At, k: number): At {
  return k === 0 ? anchor : anchor.minus(`${k} months`);
}

function periodEnd(anchor: At, k: number): At {
  if (k === 0) return anchor.plus('1 month');
  if (k === 1) return anchor;
  return anchor.minus(`${k - 1} months`);
}

function buildBilling(seed: Seed, c: CustomerSpec): void {
  const anchor = At.ago(`${c.periodDay} days`);
  const price = PRICES[c.plan][c.interval];
  const planName = PLAN_NAMES[c.plan];
  const card = c.cardLast4 ?? '0000';

  const paidPeriod = (k: number, amount: number, name: string, last4 = card) => {
    const start = periodStart(anchor, k);
    const id = seed.billingInvoice(c, {
      description: `${name} plan, ${c.interval === 'year' ? 'annual' : 'monthly'}`,
      amount,
      status: 'paid',
      start,
      end: c.interval === 'year' ? start.plus('1 year') : periodEnd(anchor, k),
      createdAt: start,
    });
    seed.payment(c, id, amount, start.plus('5 minutes'), last4);
  };

  switch (c.scenario) {
    case 'free':
      return;

    case 'paid':
      if (c.interval === 'year') {
        paidPeriod(0, price, planName);
      } else {
        for (let k = MONTHLY_PERIODS - 1; k >= 0; k--) paidPeriod(k, price, planName);
      }
      return;

    case 'canceled':
      for (let k = MONTHLY_PERIODS - 1; k >= 0; k--) paidPeriod(k, price, planName);
      return;

    case 'recovered':
      for (let k = MONTHLY_PERIODS - 1; k >= 0; k--) {
        if (k !== 3) {
          paidPeriod(k, price, planName);
          continue;
        }
        // Three periods ago: a processing error, then the first retry went through.
        const start = periodStart(anchor, k);
        const failedAt = start.plus('5 minutes');
        const id = seed.billingInvoice(c, {
          description: `${planName} plan, monthly`,
          amount: price,
          status: 'paid',
          start,
          end: periodEnd(anchor, k),
          createdAt: start,
          retryCount: 0,
          dunningStartedAt: failedAt,
        });
        seed.payment(c, id, price, failedAt, card, 'processing_error');
        const retryAt = failedAt.plus('1 day');
        const paymentId = seed.payment(c, id, price, retryAt, card);
        seed.retry(c, id, 1, retryAt, 'succeeded', paymentId, failedAt);
      }
      return;

    case 'b1-upgrade': {
      // Pro for six periods; upgraded to Business 24 days into the current one.
      for (let k = MONTHLY_PERIODS - 1; k >= 0; k--) paidPeriod(k, PRICES.pro.month, 'Pro');
      const start = anchor;
      const end = anchor.plus('1 month');
      const changeAt = anchor.plus('24 days');
      // What src/billing/proration.ts charged at the time of the upgrade (planted bug B1:
      // it uses the elapsed fraction of the period). Computed in SQL because the period's
      // length depends on the month the seed is loaded in.
      const charged = new Raw(
        `round((${PRICES.business.month} - ${PRICES.pro.month}) * ` +
          `extract(epoch FROM ${changeAt.sql} - ${start.sql}) / ` +
          `extract(epoch FROM ${end.sql} - ${start.sql}))::int`,
      );
      const id = seed.billingInvoice(c, {
        description: 'Upgrade from Pro to Business (prorated)',
        amount: charged,
        status: 'paid',
        start: changeAt,
        end,
        createdAt: changeAt,
      });
      seed.payment(c, id, charged, changeAt.plus('1 minute'), card);
      return;
    }

    case 'pending-retry': {
      for (let k = MONTHLY_PERIODS - 1; k >= 1; k--) paidPeriod(k, price, planName, '4242');
      const failedAt = anchor.plus('5 minutes');
      const id = seed.billingInvoice(c, {
        description: `${planName} plan, monthly`,
        amount: price,
        status: 'open',
        start: anchor,
        end: anchor.plus('1 month'),
        createdAt: anchor,
        retryCount: 1,
        dunningStartedAt: failedAt,
      });
      seed.payment(c, id, price, failedAt, card, 'card_declined');
      const retry1 = failedAt.plus('1 day');
      const paymentId = seed.payment(c, id, price, retry1, card, 'card_declined');
      seed.retry(c, id, 1, retry1, 'failed', paymentId, failedAt);
      seed.retry(c, id, 2, failedAt.plus('3 days'), 'scheduled', null, retry1);
      return;
    }

    case 'b2-card-update': {
      // The old card expired; two retries failed; the customer added a new card four
      // days in; the immediate retry failed and the subscription was canceled on the spot
      // (planted bug B2: the retry counter wasn't reset).
      const oldCard = '3220';
      for (let k = MONTHLY_PERIODS - 1; k >= 1; k--) paidPeriod(k, price, planName, oldCard);
      const failedAt = anchor.plus('5 minutes');
      const cardUpdatedAt = anchor.plus('4 days 2 hours');
      const id = seed.billingInvoice(c, {
        description: `${planName} plan, monthly`,
        amount: price,
        status: 'uncollectible',
        start: anchor,
        end: anchor.plus('1 month'),
        createdAt: anchor,
        retryCount: 3,
        dunningStartedAt: cardUpdatedAt,
      });
      seed.payment(c, id, price, failedAt, oldCard, 'expired_card');
      for (const [attempt, offset] of [
        [1, '1 day'],
        [2, '3 days'],
      ] as const) {
        const at = failedAt.plus(offset);
        const paymentId = seed.payment(c, id, price, at, oldCard, 'expired_card');
        seed.retry(c, id, attempt, at, 'failed', paymentId, failedAt);
      }
      seed.retry(c, id, 3, failedAt.plus('7 days'), 'canceled', null, failedAt.plus('3 days'));
      const paymentId = seed.payment(c, id, price, cardUpdatedAt, card, 'insufficient_funds');
      seed.retry(c, id, 3, cardUpdatedAt, 'failed', paymentId, cardUpdatedAt);
      return;
    }
  }
}

function buildSubscription(seed: Seed, c: CustomerSpec): void {
  const anchor = At.ago(`${c.periodDay} days`);
  const end = anchor.plus(c.interval === 'year' ? '1 year' : '1 month');
  let status = 'active';
  let canceledAt: At | null = null;
  if (c.scenario === 'pending-retry') status = 'past_due';
  if (c.scenario === 'b2-card-update') {
    status = 'canceled';
    canceledAt = anchor.plus('4 days 2 hours');
  }
  if (c.scenario === 'canceled') {
    status = 'canceled';
    canceledAt = end;
  }
  const createdMonthsAgo = c.interval === 'year' ? '1 year' : `${MONTHLY_PERIODS} months`;
  seed.subscriptions.push([
    c.id,
    c.id,
    c.plan,
    c.interval,
    status,
    anchor,
    end,
    canceledAt,
    anchor.minus(createdMonthsAgo),
  ]);
}

function buildCard(seed: Seed, c: CustomerSpec): void {
  if (!c.cardLast4) return;
  const brand = c.cardLast4.startsWith('5') ? 'Mastercard' : 'Visa';
  const updatedAt =
    c.scenario === 'b2-card-update'
      ? At.ago(`${c.periodDay} days`).plus('4 days 2 hours')
      : At.ago(`${200 + c.id} days`);
  seed.cards.push([
    c.id,
    brand,
    c.cardLast4,
    ((c.id * 5) % 12) + 1,
    new Raw(`extract(year FROM now())::int + ${1 + (c.id % 3)}`),
    updatedAt,
  ]);
}

interface PlannedInvoice {
  /** Sort key: larger is older. */
  age: number;
  createdAt: At;
  status: 'draft' | 'sent' | 'paid';
  deleted: boolean;
  lines: Line[];
  client?: [string, string];
  notes?: string;
  termDays?: number;
}

type Rng = ReturnType<typeof random>;

function randomLines(rng: Rng, c: CustomerSpec): Line[] {
  const count = rng.int(1, 3);
  return Array.from({ length: count }, () => {
    const [description, unitPriceCents] = rng.pick(c.services);
    return {
      description,
      quantity: rng.int(1, 4),
      unitPriceCents,
      vatRateBps: c.vatRateBps,
    };
  });
}

function statusForAge(rng: Rng, days: number, term: number): 'draft' | 'sent' | 'paid' {
  if (days < 3 && rng.chance(0.3)) return 'draft';
  if (days > term) return rng.chance(0.85) ? 'paid' : 'sent';
  return rng.chance(0.3) ? 'paid' : 'sent';
}

function planInvoices(rng: Rng, c: CustomerSpec): PlannedInvoice[] {
  const planned: PlannedInvoice[] = [];

  if (c.plan === 'starter') {
    // At most 5 a month: older invoices are a week apart, starting 33 days back, so
    // none of them can fall in the current month.
    const thisMonth =
      c.externalId === 'cus_maple'
        ? ([
            ['sent', false],
            ['sent', false],
            ['sent', false],
            ['draft', false],
            ['sent', true],
          ] as const)
        : ([['sent', false]] as const);
    thisMonth.forEach(([status, deleted], i) => {
      planned.push({
        age: -1 - i * 0.01,
        createdAt: At.thisMonth(`${(i + 1) * 5} hours`),
        status,
        deleted,
        lines: randomLines(rng, c),
      });
    });
    for (let i = 0; planned.length < c.invoiceCount; i++) {
      const days = 33 + i * 7;
      planned.push({
        age: days,
        createdAt: At.ago(`${days} days ${rng.int(1, 9)} hours`),
        status: rng.chance(0.9) ? 'paid' : 'sent',
        deleted: false,
        lines: randomLines(rng, c),
      });
    }
    return planned;
  }

  if (c.externalId === 'cus_kestrel') {
    // Two lines whose VAT rounds up on each line but not on the subtotal (B4).
    planned.push({
      age: 5,
      createdAt: At.ago('5 days 3 hours'),
      status: 'sent',
      deleted: false,
      client: ['Orchard Street Café', 'team@orchardcafe.example'],
      lines: [
        { description: 'Filter coffee 500 g', quantity: 1, unitPriceCents: 1250, vatRateBps: 1900 },
        {
          description: 'Filter coffee 500 g, decaf',
          quantity: 1,
          unitPriceCents: 1250,
          vatRateBps: 1900,
        },
      ],
      notes: 'Thanks for the order! Payable by bank transfer.',
      termDays: 14,
    });
  }

  const maxAge = c.scenario === 'canceled' ? 170 : 178;
  const minAge = c.scenario === 'canceled' ? 20 : 0;
  while (planned.length < c.invoiceCount) {
    const days = rng.int(minAge, maxAge);
    const hours = rng.int(0, 23);
    const term = rng.pick([14, 30]);
    const status = statusForAge(rng, days, term);
    planned.push({
      age: days + hours / 24,
      createdAt: At.ago(`${days} days ${hours} hours`),
      status,
      deleted: status !== 'paid' && rng.chance(0.04),
      lines: randomLines(rng, c),
      termDays: term,
      ...(rng.chance(0.2) ? { notes: 'Thank you for your business!' } : {}),
    });
  }
  return planned;
}

function buildInvoices(seed: Seed, rng: Rng, c: CustomerSpec): void {
  const clients = Array.from({ length: 5 }, () => rng.pick(CLIENTS));
  const planned = planInvoices(rng, c).sort((a, b) => b.age - a.age);

  planned.forEach((invoice, index) => {
    const id = seed.invoices.length + 1;
    const [clientName, clientEmail] = invoice.client ?? rng.pick(clients);
    const term = invoice.termDays ?? 14;
    const totals = invoiceTotals(invoice.lines);
    const sentAt = invoice.status === 'draft' ? null : invoice.createdAt.plus('1 hour');
    const paidAt =
      invoice.status === 'paid' ? invoice.createdAt.plus(`${rng.int(2, term)} days`) : null;
    seed.invoices.push([
      id,
      c.id,
      `INV-${String(index + 1).padStart(4, '0')}`,
      clientName,
      clientEmail,
      invoice.createdAt.date(),
      invoice.createdAt.date(term),
      invoice.status,
      invoice.notes ?? '',
      c.currency,
      totals.subtotalCents,
      totals.vatCents,
      totals.totalCents,
      invoice.createdAt,
      sentAt,
      paidAt,
      invoice.deleted ? invoice.createdAt.plus('2 hours') : null,
    ]);
    invoice.lines.forEach((line, position) => {
      seed.lines.push([
        seed.lines.length + 1,
        id,
        position + 1,
        line.description,
        line.quantity,
        line.unitPriceCents,
        line.vatRateBps,
      ]);
    });
  });
}

export function buildSeedSql(): string {
  const rng = random(20261005);
  const seed = new Seed();

  for (const c of CUSTOMERS) {
    seed.customers.push([
      c.id,
      c.externalId,
      c.companyName,
      c.contactName,
      c.contactEmail,
      c.country,
      c.timezone,
      c.currency,
      c.vatRateBps,
      At.ago(`${190 + c.id * 3} days`),
    ]);
    buildCard(seed, c);
    buildSubscription(seed, c);
    buildBilling(seed, c);
    buildInvoices(seed, rng, c);
  }

  const setval = (table: string) =>
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}));\n`;

  return [
    '-- Generated by scripts/generate-seed.ts. Do not edit: change the generator and run',
    '-- `pnpm seed:generate`. Every timestamp is relative to the moment this file is loaded.',
    '',
    "SET TIME ZONE 'UTC';",
    'BEGIN;',
    '',
    insert(
      'customers',
      [
        'id',
        'external_id',
        'company_name',
        'contact_name',
        'contact_email',
        'country',
        'timezone',
        'currency',
        'default_vat_rate_bps',
        'created_at',
      ],
      seed.customers,
    ),
    insert(
      'cards',
      ['customer_id', 'brand', 'last4', 'exp_month', 'exp_year', 'updated_at'],
      seed.cards,
    ),
    insert(
      'subscriptions',
      [
        'id',
        'customer_id',
        'plan_id',
        'billing_interval',
        'status',
        'current_period_start',
        'current_period_end',
        'canceled_at',
        'created_at',
      ],
      seed.subscriptions,
    ),
    insert(
      'billing_invoices',
      [
        'id',
        'number',
        'customer_id',
        'description',
        'amount_cents',
        'currency',
        'status',
        'period_start',
        'period_end',
        'retry_count',
        'dunning_started_at',
        'created_at',
      ],
      seed.billingInvoices,
    ),
    insert(
      'payments',
      [
        'id',
        'billing_invoice_id',
        'customer_id',
        'amount_cents',
        'currency',
        'status',
        'failure_code',
        'card_last4',
        'attempted_at',
      ],
      seed.payments,
    ),
    insert(
      'payment_retries',
      [
        'id',
        'billing_invoice_id',
        'customer_id',
        'attempt',
        'scheduled_for',
        'status',
        'payment_id',
        'created_at',
      ],
      seed.retries,
    ),
    insert(
      'invoices',
      [
        'id',
        'customer_id',
        'number',
        'client_name',
        'client_email',
        'issue_date',
        'due_date',
        'status',
        'notes',
        'currency',
        'subtotal_cents',
        'vat_cents',
        'total_cents',
        'created_at',
        'sent_at',
        'paid_at',
        'deleted_at',
      ],
      seed.invoices,
    ),
    insert(
      'invoice_lines',
      [
        'id',
        'invoice_id',
        'position',
        'description',
        'quantity',
        'unit_price_cents',
        'vat_rate_bps',
      ],
      seed.lines,
    ),
    ...[
      'customers',
      'subscriptions',
      'billing_invoices',
      'payments',
      'payment_retries',
      'invoices',
      'invoice_lines',
    ].map(setval),
    `SELECT setval('billing_invoice_number_seq', ${seed.billingNumberSeq()});\n`,
    'COMMIT;',
    '',
  ].join('\n');
}
