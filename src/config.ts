// Process configuration from the environment. Demo defaults are published on purpose
// (see .env.example); never reuse them with real data.

export interface AppConfig {
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  loopbackConfigFile: string | undefined;
  /** Allows tests to inject a clock. */
  now: () => Date;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://ledgerly:ledgerly_demo@localhost:5433/ledgerly',
    sessionSecret: env.SESSION_SECRET ?? 'ledgerly-demo-session-secret-not-for-production',
    loopbackConfigFile: env.LOOPBACK_CONFIG_FILE || undefined,
    now: () => new Date(),
  };
}
