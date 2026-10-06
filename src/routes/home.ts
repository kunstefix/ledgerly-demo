import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { getCustomerByExternalId, listCustomers } from '../db/queries/customers.js';
import { clearSession, setSession } from '../session.js';
import { homePage } from '../views/home.js';

export async function homeRoutes(app: FastifyInstance, { pool }: AppDeps) {
  app.get('/', async (request, reply) => {
    if (request.customer) return reply.redirect('/dashboard');
    const customers = await listCustomers(pool);
    return reply.page(request, { title: 'Sign in', body: homePage(customers) });
  });

  app.post<{ Body: { customer?: string } }>('/session', async (request, reply) => {
    const customer = await getCustomerByExternalId(pool, request.body?.customer ?? '');
    if (!customer) return reply.redirect('/');
    setSession(reply, customer.externalId);
    return reply.redirect('/dashboard');
  });

  app.post('/session/delete', async (_request, reply) => {
    clearSession(reply);
    return reply.redirect('/');
  });
}
