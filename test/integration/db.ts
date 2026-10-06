// Gives each test file its own database loaded from the same SQL files as the db image.

import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { inject } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPool } from '../../src/db/pool.js';
import { loadSql } from './sql.js';

export const READER = { user: 'loopback_reader', password: 'loopback_reader_demo' };

function url(database: string, user?: string, password?: string): string {
  const info = inject('pg');
  const u = encodeURIComponent(user ?? info.user);
  const p = encodeURIComponent(password ?? info.password);
  return `postgres://${u}:${p}@${info.host}:${info.port}/${database}`;
}

export interface TestDb {
  name: string;
  pool: pg.Pool;
  url: string;
  readerUrl: string;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: url('postgres') });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const loader = new pg.Client({ connectionString: url(name) });
  await loader.connect();
  await loadSql(loader);
  await loader.end();

  const pool = createPool(url(name));
  return {
    name,
    pool,
    url: url(name),
    readerUrl: url(name, READER.user, READER.password),
    close: () => pool.end(),
  };
}

export async function createTestApp(
  db: TestDb,
  options: { loopbackConfigFile?: string; now?: () => Date } = {},
): Promise<FastifyInstance> {
  return buildApp({
    pool: db.pool,
    config: {
      port: 0,
      databaseUrl: db.url,
      sessionSecret: 'test-session-secret',
      loopbackConfigFile: options.loopbackConfigFile,
      now: options.now ?? (() => new Date()),
    },
  });
}

/** Signs in through the real form and returns the session cookie header. */
export async function signIn(app: FastifyInstance, externalId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/session',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ customer: externalId }).toString(),
  });
  const cookie = response.cookies.find((c) => c.name === 'ledgerly_session');
  if (!cookie) throw new Error(`Sign in as ${externalId} failed (${response.statusCode})`);
  return `ledgerly_session=${cookie.value}`;
}
