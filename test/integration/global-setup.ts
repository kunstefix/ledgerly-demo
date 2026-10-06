import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { loadSql } from './sql.js';

export interface PgInfo {
  host: string;
  port: number;
  user: string;
  password: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    pg: PgInfo;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:17').start();

  // Load the real SQL once, serially, into the default database. That creates the
  // cluster-wide loopback_reader role, so test files loading db/support.sql in parallel
  // into their own databases don't race on it.
  const client = new pg.Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  await loadSql(client);
  await client.end();

  project.provide('pg', {
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
  });
  return async () => {
    await container?.stop();
  };
}
