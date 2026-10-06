// The daily billing job: renews subscriptions whose period has ended and runs payment
// retries that are due. In the demo it runs on demand (`pnpm billing:tick` or the
// button on /internal) instead of on a schedule.

import type pg from 'pg';
import { getCard } from '../db/queries/billing.js';
import { getPlan, planPrice, type BillingInterval } from '../db/queries/subscriptions.js';
import { withTransaction, type Db } from '../db/pool.js';
import { chargeOutcome, type ChargeOutcome } from './charge.js';
import { afterFailedRetry, startDunning } from './retries.js';

export interface PaymentRequest {
  customerId: number;
  billingInvoiceId: number;
  amountCents: number;
  currency: string;
}

/** Charges the card on file and records the payment. Marks the invoice paid on success. */
export async function attemptPayment(
  db: Db,
  request: PaymentRequest,
  now: Date,
): Promise<ChargeOutcome & { paymentId: number }> {
  const card = await getCard(db, request.customerId);
  const outcome = chargeOutcome(card, now);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO payments (billing_invoice_id, customer_id, amount_cents, currency, status,
                           failure_code, card_last4, attempted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      request.billingInvoiceId,
      request.customerId,
      request.amountCents,
      request.currency,
      outcome.ok ? 'succeeded' : 'failed',
      outcome.ok ? null : outcome.failureCode,
      card?.last4 ?? '0000',
      now,
    ],
  );
  if (outcome.ok) {
    await db.query(`UPDATE billing_invoices SET status = 'paid' WHERE id = $1`, [
      request.billingInvoiceId,
    ]);
  }
  return { ...outcome, paymentId: rows[0]!.id };
}

/** First failure on a billing invoice: start the retry schedule and mark it past due. */
export async function beginDunning(
  db: Db,
  customerId: number,
  billingInvoiceId: number,
  now: Date,
): Promise<void> {
  const { state, next } = startDunning(now);
  await db.query(
    `UPDATE billing_invoices SET retry_count = $2, dunning_started_at = $3 WHERE id = $1`,
    [billingInvoiceId, state.retryCount, state.startedAt],
  );
  if (next.action === 'retry') {
    await scheduleRetry(db, customerId, billingInvoiceId, next.attempt, next.at);
  }
  await db.query(`UPDATE subscriptions SET status = 'past_due' WHERE customer_id = $1`, [
    customerId,
  ]);
}

export async function scheduleRetry(
  db: Db,
  customerId: number,
  billingInvoiceId: number,
  attempt: number,
  at: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO payment_retries (billing_invoice_id, customer_id, attempt, scheduled_for, status)
     VALUES ($1, $2, $3, $4, 'scheduled')`,
    [billingInvoiceId, customerId, attempt, at],
  );
}

interface DueRetry {
  id: number;
  customerId: number;
  billingInvoiceId: number;
  amountCents: number;
  currency: string;
  retryCount: number;
  dunningStartedAt: Date;
}

export interface RetryResult {
  succeeded: number;
  failed: number;
  canceled: number;
}

/** Runs every retry that is due, optionally for one customer only. */
export async function processDueRetries(
  db: Db,
  now: Date,
  customerId?: number,
): Promise<RetryResult> {
  const { rows } = await db.query<DueRetry>(
    `SELECT r.id, r.customer_id AS "customerId", r.billing_invoice_id AS "billingInvoiceId",
            b.amount_cents AS "amountCents", b.currency, b.retry_count AS "retryCount",
            b.dunning_started_at AS "dunningStartedAt"
       FROM payment_retries r JOIN billing_invoices b ON b.id = r.billing_invoice_id
      WHERE r.status = 'scheduled' AND r.scheduled_for <= $1
        AND ($2::bigint IS NULL OR r.customer_id = $2)
      ORDER BY r.scheduled_for, r.id`,
    [now, customerId ?? null],
  );

  const result: RetryResult = { succeeded: 0, failed: 0, canceled: 0 };
  for (const retry of rows) {
    const payment = await attemptPayment(db, retry, now);
    await db.query(`UPDATE payment_retries SET status = $2, payment_id = $3 WHERE id = $1`, [
      retry.id,
      payment.ok ? 'succeeded' : 'failed',
      payment.paymentId,
    ]);

    if (payment.ok) {
      result.succeeded++;
      await db.query(
        `UPDATE subscriptions SET status = 'active'
          WHERE customer_id = $1 AND status = 'past_due'
            AND NOT EXISTS (SELECT 1 FROM billing_invoices
                             WHERE customer_id = $1 AND status = 'open')`,
        [retry.customerId],
      );
      continue;
    }

    result.failed++;
    const { state, next } = afterFailedRetry({
      retryCount: retry.retryCount,
      startedAt: retry.dunningStartedAt,
    });
    await db.query(`UPDATE billing_invoices SET retry_count = $2 WHERE id = $1`, [
      retry.billingInvoiceId,
      state.retryCount,
    ]);
    if (next.action === 'retry') {
      await scheduleRetry(db, retry.customerId, retry.billingInvoiceId, next.attempt, next.at);
    } else {
      result.canceled++;
      await db.query(`UPDATE billing_invoices SET status = 'uncollectible' WHERE id = $1`, [
        retry.billingInvoiceId,
      ]);
      await db.query(
        `UPDATE subscriptions SET status = 'canceled', canceled_at = $2 WHERE customer_id = $1`,
        [retry.customerId, now],
      );
    }
  }
  return result;
}

interface DueSubscription {
  customerId: number;
  planId: string;
  billingInterval: BillingInterval;
  currentPeriodEnd: Date;
  currency: string;
}

/** Starts the next period for every subscription whose period has ended. */
export async function renewSubscriptions(db: Db, now: Date): Promise<number> {
  const { rows } = await db.query<DueSubscription>(
    `SELECT s.customer_id AS "customerId", s.plan_id AS "planId",
            s.billing_interval AS "billingInterval", s.current_period_end AS "currentPeriodEnd",
            c.currency
       FROM subscriptions s JOIN customers c ON c.id = s.customer_id
      WHERE s.status IN ('active', 'past_due') AND s.current_period_end <= $1
      ORDER BY s.customer_id`,
    [now],
  );

  let renewed = 0;
  for (const sub of rows) {
    const plan = await getPlan(db, sub.planId);
    if (!plan) continue;
    const step = sub.billingInterval === 'year' ? '1 year' : '1 month';
    const period = await db.query<{ start: Date; end: Date }>(
      `SELECT $1::timestamptz AS start, $1::timestamptz + $2::interval AS "end"`,
      [sub.currentPeriodEnd, step],
    );
    const { start, end } = period.rows[0]!;
    await db.query(
      `UPDATE subscriptions SET current_period_start = $2, current_period_end = $3
        WHERE customer_id = $1`,
      [sub.customerId, start, end],
    );
    renewed++;

    const price = planPrice(plan, sub.billingInterval);
    if (price === 0) continue;
    const invoice = await db.query<{ id: number }>(
      `INSERT INTO billing_invoices (customer_id, description, amount_cents, currency, status,
                                     period_start, period_end, created_at)
       VALUES ($1, $2, $3, $4, 'open', $5, $6, $7) RETURNING id`,
      [
        sub.customerId,
        `${plan.name} plan, ${sub.billingInterval === 'year' ? 'annual' : 'monthly'}`,
        price,
        sub.currency,
        start,
        end,
        now,
      ],
    );
    const billingInvoiceId = invoice.rows[0]!.id;
    const payment = await attemptPayment(
      db,
      { customerId: sub.customerId, billingInvoiceId, amountCents: price, currency: sub.currency },
      now,
    );
    if (!payment.ok) await beginDunning(db, sub.customerId, billingInvoiceId, now);
  }
  return renewed;
}

export interface TickSummary extends RetryResult {
  renewed: number;
}

export async function runBillingTick(pool: pg.Pool, now: Date): Promise<TickSummary> {
  return withTransaction(pool, async (client) => {
    const renewed = await renewSubscriptions(client, now);
    const retries = await processDueRetries(client, now);
    return { renewed, ...retries };
  });
}
