// Public endpoints Loopback's demo-setup reads: the named queries and the help center.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { helpExportStream } from '../loopback/help-export.js';

const NAMED_QUERIES = fileURLToPath(new URL('../../loopback/named-queries.json', import.meta.url));

export async function loopbackRoutes(app: FastifyInstance, _deps: AppDeps) {
  app.get('/loopback/named-queries.json', async (_request, reply) => {
    return reply
      .type('application/json; charset=utf-8')
      .send(await readFile(NAMED_QUERIES, 'utf8'));
  });

  app.get('/loopback/help-export.tar.gz', async (_request, reply) => {
    return reply
      .type('application/gzip')
      .header('content-disposition', 'attachment; filename="ledgerly-help.tar.gz"')
      .send(await helpExportStream());
  });
}
