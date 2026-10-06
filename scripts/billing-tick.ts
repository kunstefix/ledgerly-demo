// Runs the daily billing job once: `pnpm billing:tick`.

import { runBillingTick } from '../src/billing/tick.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/pool.js';

const pool = createPool(loadConfig().databaseUrl);
try {
  const result = await runBillingTick(pool, new Date());
  console.log(
    `Renewed ${result.renewed} subscriptions. Retries: ${result.succeeded} succeeded, ` +
      `${result.failed} failed, ${result.canceled} subscriptions canceled.`,
  );
} finally {
  await pool.end();
}
