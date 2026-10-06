// Writes db/seed.sql. Run with `pnpm seed:generate` after changing scripts/seed/*.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildSeedSql } from './seed/build.js';

export const SEED_FILE = fileURLToPath(new URL('../db/seed.sql', import.meta.url));

await writeFile(SEED_FILE, buildSeedSql());
console.log(`Wrote ${SEED_FILE}`);
