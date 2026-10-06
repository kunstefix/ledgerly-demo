// Payment retries ("dunning") after a failed subscription payment.
//
// When a payment fails, Ledgerly retries it 3 times over 7 days: 1, 3 and 7 days after
// the first failure. If the third retry also fails, the subscription is canceled and
// the billing invoice is marked uncollectible.
//
// Updating the card restarts the schedule: the counter goes back to zero and the payment
// is retried right away with the new card.

export const RETRY_OFFSETS_DAYS = [1, 3, 7] as const;
export const MAX_RETRIES = RETRY_OFFSETS_DAYS.length;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DunningState {
  /** Failed retries so far (the initial failed payment doesn't count). */
  retryCount: number;
  /** When the current retry schedule started. */
  startedAt: Date;
}

export type RetryDecision = { action: 'retry'; attempt: number; at: Date } | { action: 'cancel' };

/** The first retry after the initial payment failed at `failedAt`. */
export function startDunning(failedAt: Date): { state: DunningState; next: RetryDecision } {
  const state = { retryCount: 0, startedAt: failedAt };
  return { state, next: nextRetry(state) };
}

/** What happens after a retry fails. */
export function afterFailedRetry(state: DunningState): {
  state: DunningState;
  next: RetryDecision;
} {
  const next = { ...state, retryCount: state.retryCount + 1 };
  return { state: next, next: nextRetry(next) };
}

/** The customer updated their card: restart the schedule and retry now. */
export function afterCardUpdated(state: DunningState, now: Date): DunningState {
  return { ...state, startedAt: now };
}

export function nextRetry(state: DunningState): RetryDecision {
  const offset = RETRY_OFFSETS_DAYS[state.retryCount];
  if (offset === undefined) return { action: 'cancel' };
  return {
    action: 'retry',
    attempt: state.retryCount + 1,
    at: new Date(state.startedAt.getTime() + offset * DAY_MS),
  };
}
