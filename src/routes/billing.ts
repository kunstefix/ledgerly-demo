import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { changePlan, updateCard } from '../billing/actions.js';
import { cardBrand, isValidCardNumber } from '../billing/charge.js';
import {
  getCard,
  listBillingInvoices,
  listPayments,
  listScheduledRetries,
} from '../db/queries/billing.js';
import { getPlan, getSubscription, listPlans } from '../db/queries/subscriptions.js';
import { withTransaction } from '../db/pool.js';
import { requireCustomer, signedInCustomer } from '../session.js';
import { billingPage, planPage } from '../views/billing.js';
import { cardFormPage } from '../views/card-form.js';

type Body = Record<string, string | undefined>;

export async function billingRoutes(app: FastifyInstance, { pool, config }: AppDeps) {
  app.addHook('preHandler', requireCustomer);

  app.get('/billing', async (request, reply) => {
    const customer = signedInCustomer(request);
    const subscription = await getSubscription(pool, customer.id);
    if (!subscription) throw new Error(`No subscription for ${customer.externalId}`);
    return reply.page(request, {
      title: 'Billing',
      section: 'billing',
      body: billingPage({
        customer,
        subscription,
        card: await getCard(pool, customer.id),
        billingInvoices: await listBillingInvoices(pool, customer.id),
        payments: await listPayments(pool, customer.id),
        retries: await listScheduledRetries(pool, customer.id),
        now: config.now(),
      }),
    });
  });

  app.get('/billing/plan', async (request, reply) => {
    const customer = signedInCustomer(request);
    const subscription = await getSubscription(pool, customer.id);
    if (!subscription) throw new Error(`No subscription for ${customer.externalId}`);
    return reply.page(request, {
      title: 'Change plan',
      section: 'billing',
      body: planPage(customer, subscription, await listPlans(pool)),
    });
  });

  app.post<{ Body: Body }>('/billing/plan', async (request, reply) => {
    const customer = signedInCustomer(request);
    const plan = await getPlan(pool, request.body?.plan ?? '');
    if (!plan) return reply.redirect('/billing/plan');

    const result = await withTransaction(pool, (client) =>
      changePlan(client, customer, plan, config.now()),
    );
    const notice =
      result.kind === 'charged'
        ? result.failureCode
          ? 'plan-payment-failed'
          : 'plan-charged'
        : result.kind === 'credited'
          ? 'plan-credited'
          : 'plan-changed';
    return reply.redirect(`/billing?notice=${notice}`);
  });

  app.get('/billing/card', async (request, reply) => {
    return reply.page(request, {
      title: 'Update card',
      section: 'billing',
      body: cardFormPage(null),
    });
  });

  app.post<{ Body: Body }>('/billing/card', async (request, reply) => {
    const customer = signedInCustomer(request);
    const now = config.now();
    const number = (request.body?.number ?? '').replace(/[\s-]/g, '');
    const expMonth = Number(request.body?.expMonth);
    const expYear = Number(request.body?.expYear);
    const cvc = request.body?.cvc ?? '';

    let error: string | null = null;
    if (!isValidCardNumber(number)) error = "That card number doesn't look right.";
    else if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
      error = 'Enter the expiry month (1–12).';
    } else if (!Number.isInteger(expYear) || expYear < 2000 || expYear > 2099) {
      error = 'Enter the expiry year, like 2029.';
    } else if (!/^\d{3,4}$/.test(cvc)) error = 'Enter the 3 or 4 digit security code.';
    if (error) {
      return reply.page(request, {
        title: 'Update card',
        section: 'billing',
        status: 422,
        body: cardFormPage(error),
      });
    }

    const card = { brand: cardBrand(number), last4: number.slice(-4), expMonth, expYear };
    const result = await withTransaction(pool, (client) =>
      updateCard(client, customer, card, now),
    );
    const notice =
      result.kind === 'saved'
        ? 'card-saved'
        : result.ok
          ? 'card-retry-ok'
          : result.canceled
            ? 'card-retry-canceled'
            : 'card-retry-failed';
    return reply.redirect(`/billing?notice=${notice}`);
  });
}
