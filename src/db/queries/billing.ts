import type { CardOnFile } from '../../billing/charge.js';
import type { Db } from '../pool.js';

export interface BillingInvoice {
  id: number;
  number: string;
  description: string;
  amountCents: number;
  currency: 'EUR' | 'USD';
  status: 'paid' | 'open' | 'uncollectible' | 'void';
  periodStart: Date | null;
  periodEnd: Date | null;
  retryCount: number;
  dunningStartedAt: Date | null;
  createdAt: Date;
}

export interface Payment {
  id: number;
  billingInvoiceNumber: string;
  amountCents: number;
  currency: 'EUR' | 'USD';
  status: 'succeeded' | 'failed';
  failureCode: string | null;
  cardLast4: string;
  attemptedAt: Date;
}

export interface ScheduledRetry {
  id: number;
  billingInvoiceId: number;
  billingInvoiceNumber: string;
  attempt: number;
  scheduledFor: Date;
}

const BILLING_INVOICE_COLUMNS = `
  b.id, b.number, b.description, b.amount_cents AS "amountCents", b.currency, b.status,
  b.period_start AS "periodStart", b.period_end AS "periodEnd", b.retry_count AS "retryCount",
  b.dunning_started_at AS "dunningStartedAt", b.created_at AS "createdAt"`;

export async function listBillingInvoices(db: Db, customerId: number): Promise<BillingInvoice[]> {
  const { rows } = await db.query<BillingInvoice>(
    `SELECT ${BILLING_INVOICE_COLUMNS} FROM billing_invoices b
      WHERE b.customer_id = $1 ORDER BY b.created_at DESC, b.id DESC`,
    [customerId],
  );
  return rows;
}

export async function getOpenBillingInvoice(
  db: Db,
  customerId: number,
): Promise<BillingInvoice | null> {
  const { rows } = await db.query<BillingInvoice>(
    `SELECT ${BILLING_INVOICE_COLUMNS} FROM billing_invoices b
      WHERE b.customer_id = $1 AND b.status = 'open'
      ORDER BY b.created_at DESC LIMIT 1`,
    [customerId],
  );
  return rows[0] ?? null;
}

export async function listPayments(db: Db, customerId: number): Promise<Payment[]> {
  const { rows } = await db.query<Payment>(
    `SELECT p.id, b.number AS "billingInvoiceNumber", p.amount_cents AS "amountCents",
            p.currency, p.status, p.failure_code AS "failureCode", p.card_last4 AS "cardLast4",
            p.attempted_at AS "attemptedAt"
       FROM payments p JOIN billing_invoices b ON b.id = p.billing_invoice_id
      WHERE p.customer_id = $1 ORDER BY p.attempted_at DESC, p.id DESC`,
    [customerId],
  );
  return rows;
}

export async function listScheduledRetries(db: Db, customerId: number): Promise<ScheduledRetry[]> {
  const { rows } = await db.query<ScheduledRetry>(
    `SELECT r.id, r.billing_invoice_id AS "billingInvoiceId", b.number AS "billingInvoiceNumber",
            r.attempt, r.scheduled_for AS "scheduledFor"
       FROM payment_retries r JOIN billing_invoices b ON b.id = r.billing_invoice_id
      WHERE r.customer_id = $1 AND r.status = 'scheduled' ORDER BY r.scheduled_for`,
    [customerId],
  );
  return rows;
}

export async function getCard(db: Db, customerId: number): Promise<CardOnFile | null> {
  const { rows } = await db.query<CardOnFile>(
    `SELECT brand, last4, exp_month AS "expMonth", exp_year AS "expYear"
       FROM cards WHERE customer_id = $1`,
    [customerId],
  );
  return rows[0] ?? null;
}

export async function saveCard(
  db: Db,
  customerId: number,
  card: CardOnFile,
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO cards (customer_id, brand, last4, exp_month, exp_year, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (customer_id) DO UPDATE
       SET brand = excluded.brand, last4 = excluded.last4, exp_month = excluded.exp_month,
           exp_year = excluded.exp_year, updated_at = excluded.updated_at`,
    [customerId, card.brand, card.last4, card.expMonth, card.expYear, now],
  );
}
