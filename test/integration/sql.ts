import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/** The files the db image runs from /docker-entrypoint-initdb.d, in order. */
export const SQL_FILES = ['schema.sql', 'seed.sql', 'support.sql'];

export async function loadSql(client: pg.ClientBase, files = SQL_FILES): Promise<void> {
  for (const file of files) {
    const sql = await readFile(fileURLToPath(new URL(`../../db/${file}`, import.meta.url)), 'utf8');
    await client.query(sql);
  }
}
