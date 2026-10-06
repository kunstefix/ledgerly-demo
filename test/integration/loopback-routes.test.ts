// Named queries and the help archive are served for Loopback's demo-setup (R10, R11).
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { extract } from 'tar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, createTestDb, type TestDb } from './db.js';

let db: TestDb;
let app: FastifyInstance;
let dir: string;

beforeAll(async () => {
  db = await createTestDb();
  app = await createTestApp(db);
  dir = await mkdtemp(join(tmpdir(), 'ledgerly-help-'));
});
afterAll(async () => {
  await app?.close();
  await db?.close();
  await rm(dir, { recursive: true, force: true });
});

function frontMatter(markdown: string): Record<string, string> | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) return null;
  return Object.fromEntries(
    match[1]!.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [
        key!.trim(),
        rest
          .join(':')
          .trim()
          .replace(/^"(.*)"$/, '$1'),
      ];
    }),
  );
}

describe('loopback endpoints', () => {
  it('serves the named queries file as JSON', async () => {
    const response = await app.inject({ url: '/loopback/named-queries.json' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    const file = fileURLToPath(new URL('../../loopback/named-queries.json', import.meta.url));
    expect(response.json()).toEqual(JSON.parse(await readFile(file, 'utf8')));
  });

  it('serves the help center as a tar.gz of articles with valid front matter', async () => {
    const response = await app.inject({ url: '/loopback/help-export.tar.gz' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/gzip');

    const archive = join(dir, 'help.tar.gz');
    await writeFile(archive, response.rawPayload);
    await extract({ file: archive, cwd: dir });
    const files = (await readdir(join(dir, 'help'))).sort();
    expect(files.length).toBe(12);

    const slugs = new Set<string>();
    const visibilities: string[] = [];
    for (const name of files) {
      const meta = frontMatter(await readFile(join(dir, 'help', name), 'utf8'));
      expect(meta, name).not.toBeNull();
      expect(meta!.title, name).toBeTruthy();
      expect(meta!.slug, name).toMatch(/^[a-z0-9-]+$/);
      expect(meta!.collection, name).toBeTruthy();
      expect(['public', 'agent'], name).toContain(meta!.visibility);
      expect(`${meta!.slug}.md`).toBe(name);
      slugs.add(meta!.slug!);
      visibilities.push(meta!.visibility!);
    }
    expect(slugs.size).toBe(12);
    expect(visibilities.filter((v) => v === 'agent')).toHaveLength(1);
  });
});
