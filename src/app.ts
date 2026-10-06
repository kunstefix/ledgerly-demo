import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import { loadLoopbackConfig } from './loopback/config.js';
import { widgetTag } from './loopback/widget.js';
import { billingRoutes } from './routes/billing.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { healthRoutes } from './routes/health.js';
import { homeRoutes } from './routes/home.js';
import { internalRoutes } from './routes/internal.js';
import { invoiceRoutes } from './routes/invoices.js';
import { loopbackRoutes } from './routes/loopback.js';
import { loadSession } from './session.js';
import type { SafeHtml } from './views/html.js';
import { layout, type Flash, type Section } from './views/layout.js';

export interface AppDeps {
  config: AppConfig;
  pool: pg.Pool;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// Short messages shown after a redirect (?notice=...).
const NOTICES: Record<string, Flash> = {
  'invoice-created': { kind: 'ok', text: 'Draft saved.' },
  'invoice-sent': { kind: 'ok', text: 'Invoice sent.' },
  'invoice-deleted': { kind: 'ok', text: 'Invoice deleted.' },
  'plan-changed': { kind: 'ok', text: 'Your plan has been changed.' },
  'plan-charged': { kind: 'ok', text: 'Your plan has been changed and the difference charged.' },
  'plan-credited': { kind: 'ok', text: 'Your plan has been changed. Unused time was credited.' },
  'plan-payment-failed': {
    kind: 'error',
    text: "Your plan has been changed, but the payment failed. We'll retry it.",
  },
  'card-saved': { kind: 'ok', text: 'Card saved.' },
  'card-retry-ok': { kind: 'ok', text: 'Card saved and the outstanding payment went through.' },
  'card-retry-failed': {
    kind: 'error',
    text: "Card saved, but the outstanding payment failed again. We'll keep retrying.",
  },
  'card-retry-canceled': {
    kind: 'error',
    text: 'Card saved, but the payment failed again and your subscription was canceled.',
  },
};

export interface PageOptions {
  title: string;
  body: SafeHtml;
  section?: Section;
  flash?: Flash | null;
  status?: number;
}

declare module 'fastify' {
  interface FastifyReply {
    page(request: FastifyRequest, options: PageOptions): Promise<FastifyReply>;
  }
}

export async function buildApp({ config, pool }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' } });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(formbody);
  await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/static/' });

  app.decorateRequest('customer', null);
  app.addHook('preHandler', loadSession(pool));

  app.decorateReply(
    'page',
    async function (this: FastifyReply, request: FastifyRequest, options: PageOptions) {
      const loopback = await loadLoopbackConfig(config.loopbackConfigFile);
      const customer = request.customer;
      const widget =
        customer && loopback ? await widgetTag(loopback, customer, config.now()) : null;
      const notice = (request.query as Record<string, string | undefined>)?.notice;
      const flash = options.flash ?? (notice ? (NOTICES[notice] ?? null) : null);
      return this.code(options.status ?? 200)
        .type('text/html; charset=utf-8')
        .send(
          layout({
            title: options.title,
            body: options.body,
            section: options.section,
            customer,
            loopback,
            widget,
            flash,
          }).value,
        );
    },
  );

  const deps = { config, pool };
  await app.register(healthRoutes, deps);
  await app.register(homeRoutes, deps);
  await app.register(dashboardRoutes, deps);
  await app.register(invoiceRoutes, deps);
  await app.register(billingRoutes, deps);
  await app.register(internalRoutes, deps);
  await app.register(loopbackRoutes, deps);

  return app;
}
