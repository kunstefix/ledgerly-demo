import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { getOpenBillingInvoice, listScheduledRetries } from '../db/queries/billing.js';
import { invoicesCreatedSince, listInvoices } from '../db/queries/invoices.js';
import { getSubscription } from '../db/queries/subscriptions.js';
import { checkInvoiceLimit, monthStart } from '../invoices/limits.js';
import { requireCustomer, signedInCustomer } from '../session.js';
import { dashboardPage } from '../views/dashboard.js';

export async function dashboardRoutes(app: FastifyInstance, { pool, config }: AppDeps) {
  app.get('/dashboard', { preHandler: requireCustomer }, async (request, reply) => {
    const customer = signedInCustomer(request);
    const now = config.now();
    const subscription = await getSubscription(pool, customer.id);
    if (!subscription) throw new Error(`No subscription for ${customer.externalId}`);

    const thisMonth = await invoicesCreatedSince(pool, customer.id, monthStart(now));
    const retries = await listScheduledRetries(pool, customer.id);
    return reply.page(request, {
      title: 'Dashboard',
      section: 'dashboard',
      body: dashboardPage({
        customer,
        subscription,
        usage: checkInvoiceLimit(thisMonth, subscription.plan.monthlyInvoiceLimit, now),
        openInvoice: await getOpenBillingInvoice(pool, customer.id),
        nextRetry: retries[0] ?? null,
        recentInvoices: await listInvoices(pool, customer.id, 5),
        now,
      }),
    });
  });
}
