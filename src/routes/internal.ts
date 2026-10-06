import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { runBillingTick } from '../billing/tick.js';
import { internalPage } from '../views/internal.js';

export async function internalRoutes(app: FastifyInstance, { pool, config }: AppDeps) {
  app.get('/internal', async (request, reply) => {
    return reply.page(request, { title: 'Internal tools', body: internalPage(null) });
  });

  app.post('/internal/billing-tick', async (request, reply) => {
    const result = await runBillingTick(pool, config.now());
    return reply.page(request, { title: 'Internal tools', body: internalPage(result) });
  });
}
