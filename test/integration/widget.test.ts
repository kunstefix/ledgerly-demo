// The widget tag appears on signed-in pages when Loopback is configured, and a banner
// shows when it isn't (R7, R8).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestDb, signIn, type TestDb } from './db.js';

let db: TestDb;
let dir: string;
let configFile: string;
let app: FastifyInstance;

const secret = 'widget-test-secret';

beforeAll(async () => {
  db = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), 'ledgerly-widget-'));
  configFile = join(dir, 'loopback.json');
  app = await createTestApp(db, { loopbackConfigFile: configFile });
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

function scriptTag(body: string): string | undefined {
  return /<script[^>]*data-loopback-widget[^>]*><\/script>/s.exec(body)?.[0];
}

describe('support widget', () => {
  it('shows a banner and no widget when Loopback is not configured', async () => {
    await rm(configFile, { force: true });
    const cookie = await signIn(app, 'cus_maple');
    const body = (await app.inject({ url: '/dashboard', headers: { cookie } })).body;
    expect(scriptTag(body)).toBeUndefined();
    expect(body).toContain("Support chat isn't configured");
  });

  it('embeds the widget with a valid token once the config file appears', async () => {
    await writeFile(
      configFile,
      JSON.stringify({
        apiPublicUrl: 'http://localhost:3001/',
        widgetConnectionId: 'conn_ledgerly',
        identitySecret: secret,
        helpCenterUrl: 'http://localhost:3002/help',
      }),
    );
    const cookie = await signIn(app, 'cus_tidewater');
    for (const url of ['/dashboard', '/invoices', '/billing']) {
      const body = (await app.inject({ url, headers: { cookie } })).body;
      const tag = scriptTag(body);
      expect(tag, url).toBeDefined();
      expect(body).not.toContain("Support chat isn't configured");
      expect(body).toContain('href="http://localhost:3002/help"');

      expect(tag).toContain('src="http://localhost:3001/widget.js"');
      expect(tag).toContain('data-loopback-widget="conn_ledgerly"');
      expect(tag).toMatch(/\basync\b/);
      const token = /data-customer-token="([^"]+)"/.exec(tag!)![1]!;
      const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(secret));
      expect(protectedHeader.alg).toBe('HS256');
      expect(payload).toMatchObject({
        sub: 'cus_tidewater',
        email: 'marcus@tidewaterconsulting.example',
        name: 'Marcus Hale',
      });
      expect(payload.exp! - payload.iat!).toBe(3600);
    }
  });

  it('never embeds the widget when signed out', async () => {
    const body = (await app.inject({ url: '/' })).body;
    expect(scriptTag(body)).toBeUndefined();
  });
});
