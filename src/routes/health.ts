import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';

export async function healthRoutes(app: FastifyInstance, { pool }: AppDeps) {
  app.get('/healthz', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false, error: 'database unavailable' });
    }
  });
}
