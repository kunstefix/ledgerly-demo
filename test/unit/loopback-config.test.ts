import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadLoopbackConfig } from '../../src/loopback/config.js';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ledgerly-loopback-'));
  file = join(dir, 'loopback.json');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const valid = {
  apiPublicUrl: 'http://localhost:3001/',
  widgetConnectionId: 'conn_123',
  identitySecret: 'shh',
  helpCenterUrl: 'http://localhost:3002/help',
};

describe('loadLoopbackConfig', () => {
  it('reads the file and trims the trailing slash', async () => {
    await writeFile(file, JSON.stringify(valid));
    expect(await loadLoopbackConfig(file, {})).toEqual({
      ...valid,
      apiPublicUrl: 'http://localhost:3001',
    });
  });

  it('re-reads the file on every call', async () => {
    expect(await loadLoopbackConfig(file, {})).toBeNull();
    await writeFile(file, JSON.stringify(valid));
    expect(await loadLoopbackConfig(file, {})).not.toBeNull();
  });

  it('returns null for a missing or invalid file', async () => {
    expect(await loadLoopbackConfig(undefined, {})).toBeNull();
    expect(await loadLoopbackConfig(join(dir, 'nope.json'), {})).toBeNull();
    await writeFile(file, '{not json');
    expect(await loadLoopbackConfig(file, {})).toBeNull();
    await writeFile(file, JSON.stringify({ ...valid, apiPublicUrl: 'javascript:alert(1)' }));
    expect(await loadLoopbackConfig(file, {})).toBeNull();
    await writeFile(file, JSON.stringify({ ...valid, identitySecret: '' }));
    expect(await loadLoopbackConfig(file, {})).toBeNull();
  });

  it('lets env vars override the file', async () => {
    await writeFile(file, JSON.stringify(valid));
    const config = await loadLoopbackConfig(file, {
      LOOPBACK_API_PUBLIC_URL: 'https://support.example',
      LOOPBACK_IDENTITY_SECRET: 'from-env',
    });
    expect(config?.apiPublicUrl).toBe('https://support.example');
    expect(config?.identitySecret).toBe('from-env');
    expect(config?.widgetConnectionId).toBe('conn_123');
  });

  it('works from env vars alone', async () => {
    const config = await loadLoopbackConfig(undefined, {
      LOOPBACK_API_PUBLIC_URL: 'http://localhost:3001',
      LOOPBACK_WIDGET_CONNECTION_ID: 'conn_env',
      LOOPBACK_IDENTITY_SECRET: 'env-secret',
    });
    expect(config).toEqual({
      apiPublicUrl: 'http://localhost:3001',
      widgetConnectionId: 'conn_env',
      identitySecret: 'env-secret',
    });
  });
});
