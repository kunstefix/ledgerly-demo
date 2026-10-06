import type { Db } from '../pool.js';

export type PlanId = 'starter' | 'pro' | 'business';
export type BillingInterval = 'month' | 'year';

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  monthlyInvoiceLimit: number | null;
}

export interface Subscription {
  id: number;
  customerId: number;
  plan: Plan;
  billingInterval: BillingInterval;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
}

const PLAN_COLUMNS = `
  p.id, p.name, p.monthly_price_cents AS "monthlyPriceCents",
  p.annual_price_cents AS "annualPriceCents", p.monthly_invoice_limit AS "monthlyInvoiceLimit"`;

export function planPrice(plan: Plan, interval: BillingInterval): number {
  return interval === 'year' ? plan.annualPriceCents : plan.monthlyPriceCents;
}

export async function listPlans(db: Db): Promise<Plan[]> {
  const { rows } = await db.query<Plan>(
    `SELECT ${PLAN_COLUMNS} FROM plans p ORDER BY p.monthly_price_cents`,
  );
  return rows;
}

export async function getPlan(db: Db, id: string): Promise<Plan | null> {
  const { rows } = await db.query<Plan>(`SELECT ${PLAN_COLUMNS} FROM plans p WHERE p.id = $1`, [
    id,
  ]);
  return rows[0] ?? null;
}

interface SubscriptionRow extends Omit<Subscription, 'plan'> {
  planId: PlanId;
}

export async function getSubscription(db: Db, customerId: number): Promise<Subscription | null> {
  const { rows } = await db.query<SubscriptionRow>(
    `SELECT s.id, s.customer_id AS "customerId", s.plan_id AS "planId",
            s.billing_interval AS "billingInterval", s.status,
            s.current_period_start AS "currentPeriodStart",
            s.current_period_end AS "currentPeriodEnd", s.canceled_at AS "canceledAt"
       FROM subscriptions s WHERE s.customer_id = $1`,
    [customerId],
  );
  const row = rows[0];
  if (!row) return null;
  const plan = await getPlan(db, row.planId);
  if (!plan) throw new Error(`Unknown plan ${row.planId}`);
  const { planId: _planId, ...rest } = row;
  return { ...rest, plan };
}
