// The help center as a .tar.gz of markdown files, for Loopback's help import.

import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { create } from 'tar';

// Resolves to <repo>/help from both src/loopback (tsx) and dist/loopback (build).
export const HELP_DIR = fileURLToPath(new URL('../../help', import.meta.url));

export async function helpArticleFiles(dir = HELP_DIR): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith('.md')).sort();
}

export async function helpExportStream(dir = HELP_DIR): Promise<Readable> {
  const files = await helpArticleFiles(dir);
  // tar returns a Minipass stream; wrap it so Fastify and Node APIs see a real Readable.
  return Readable.from(create({ gzip: true, cwd: dir, portable: true, prefix: 'help' }, files));
}
