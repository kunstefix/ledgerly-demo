// What the customer can do on the billing page: change plan and update their card.

import { getOpenBillingInvoice, saveCard } from '../db/queries/billing.js';
import type { Customer } from '../db/queries/customers.js';
import { getSubscription, planPrice, type Plan } from '../db/queries/subscriptions.js';
import type { Db } from '../db/pool.js';
import type { CardOnFile } from './charge.js';
import type { FailureCode } from './failure-codes.js';
import { prorationAmount } from './proration.js';
import { afterCardUpdated } from './retries.js';
import { attemptPayment, beginDunning, processDueRetries, scheduleRetry } from './tick.js';

export type PlanChangeResult =
  | { kind: 'unchanged' }
  | { kind: 'charged'; amountCents: number; failureCode?: FailureCode }
  | { kind: 'credited'; amountCents: number }
  | { kind: 'switched' };

async function chargeNow(
  db: Db,
  customer: Customer,
  description: string,
  amountCents: number,
  period: { start: Date; end: Date },
  now: Date,
): Promise<FailureCode | undefined> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO billing_invoices (customer_id, description, amount_cents, currency, status,
                                   period_start, period_end, created_at)
     VALUES ($1, $2, $3, $4, 'open', $5, $6, $7) RETURNING id`,
    [customer.id, description, amountCents, customer.currency, period.start, period.end, now],
  );
  const billingInvoiceId = rows[0]!.id;
  const payment = await attemptPayment(
    db,
    { customerId: customer.id, billingInvoiceId, amountCents, currency: customer.currency },
    now,
  );
  if (payment.ok) return undefined;
  await beginDunning(db, customer.id, billingInvoiceId, now);
  return payment.failureCode;
}

export async function changePlan(
  db: Db,
  customer: Customer,
  newPlan: Plan,
  now: Date,
): Promise<PlanChangeResult> {
  const subscription = await getSubscription(db, customer.id);
  if (!subscription) throw new Error(`Customer ${customer.externalId} has no subscription`);
  const interval = subscription.billingInterval;

  // A canceled subscription restarts on the new plan with a fresh, fully paid period.
  if (subscription.status === 'canceled') {
    const period = await db.query<{ start: Date; end: Date }>(
      `SELECT $1::timestamptz AS start, $1::timestamptz + $2::interval AS "end"`,
      [now, interval === 'year' ? '1 year' : '1 month'],
    );
    const { start, end } = period.rows[0]!;
    await db.query(
      `UPDATE subscriptions SET plan_id = $2, status = 'active', canceled_at = NULL,
              current_period_start = $3, current_period_end = $4
        WHERE customer_id = $1`,
      [customer.id, newPlan.id, start, end],
    );
    const price = planPrice(newPlan, interval);
    if (price === 0) return { kind: 'switched' };
    const failureCode = await chargeNow(
      db,
      customer,
      `${newPlan.name} plan, ${interval === 'year' ? 'annual' : 'monthly'}`,
      price,
      { start, end },
      now,
    );
    return { kind: 'charged', amountCents: price, ...(failureCode ? { failureCode } : {}) };
  }

  if (subscription.plan.id === newPlan.id) return { kind: 'unchanged' };

  const amountCents = prorationAmount({
    currentPriceCents: planPrice(subscription.plan, interval),
    newPriceCents: planPrice(newPlan, interval),
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    changeAt: now,
  });
  await db.query(`UPDATE subscriptions SET plan_id = $2 WHERE customer_id = $1`, [
    customer.id,
    newPlan.id,
  ]);
  const period = { start: now, end: subscription.currentPeriodEnd };

  if (amountCents > 0) {
    const failureCode = await chargeNow(
      db,
      customer,
      `Upgrade from ${subscription.plan.name} to ${newPlan.name} (prorated)`,
      amountCents,
      period,
      now,
    );
    return { kind: 'charged', amountCents, ...(failureCode ? { failureCode } : {}) };
  }
  if (amountCents < 0) {
    await db.query(
      `INSERT INTO billing_invoices (customer_id, description, amount_cents, currency, status,
                                     period_start, period_end, created_at)
       VALUES ($1, $2, $3, $4, 'paid', $5, $6, $7)`,
      [
        customer.id,
        `Credit for unused time on ${subscription.plan.name}`,
        amountCents,
        customer.currency,
        period.start,
        period.end,
        now,
      ],
    );
    return { kind: 'credited', amountCents };
  }
  return { kind: 'switched' };
}

export type CardUpdateResult =
  | { kind: 'saved' }
  | { kind: 'retried'; ok: true }
  | { kind: 'retried'; ok: false; canceled: boolean };

/**
 * Saves the new card. If a payment is failing, the retry schedule restarts and the
 * payment is retried right away with the new card.
 */
export async function updateCard(
  db: Db,
  customer: Customer,
  card: CardOnFile,
  now: Date,
): Promise<CardUpdateResult> {
  await saveCard(db, customer.id, card, now);

  const open = await getOpenBillingInvoice(db, customer.id);
  if (!open || !open.dunningStartedAt) return { kind: 'saved' };

  const state = afterCardUpdated(
    { retryCount: open.retryCount, startedAt: open.dunningStartedAt },
    now,
  );
  await db.query(
    `UPDATE billing_invoices SET retry_count = $2, dunning_started_at = $3 WHERE id = $1`,
    [open.id, state.retryCount, state.startedAt],
  );
  await db.query(
    `UPDATE payment_retries SET status = 'canceled'
      WHERE billing_invoice_id = $1 AND status = 'scheduled'`,
    [open.id],
  );
  await scheduleRetry(db, customer.id, open.id, state.retryCount + 1, now);

  const result = await processDueRetries(db, now, customer.id);
  if (result.succeeded > 0) return { kind: 'retried', ok: true };
  return { kind: 'retried', ok: false, canceled: result.canceled > 0 };
}
