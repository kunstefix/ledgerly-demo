// Planted bug B2 lives in retries.ts (see PLANTED_BUGS.md). These tests cover the retry
// schedule and deliberately never assert what happens after a card update.
import { describe, expect, it } from 'vitest';
import {
  afterFailedRetry,
  MAX_RETRIES,
  nextRetry,
  RETRY_OFFSETS_DAYS,
  startDunning,
} from '../../src/billing/retries.js';

const failedAt = new Date('2026-03-10T09:00:00Z');

describe('payment retries', () => {
  it('retries 3 times over 7 days', () => {
    expect(MAX_RETRIES).toBe(3);
    expect(RETRY_OFFSETS_DAYS).toEqual([1, 3, 7]);
  });

  it('schedules the first retry one day after the failure', () => {
    const { state, next } = startDunning(failedAt);
    expect(state.retryCount).toBe(0);
    expect(next).toEqual({ action: 'retry', attempt: 1, at: new Date('2026-03-11T09:00:00Z') });
  });

  it('schedules retries 2 and 3 on days 3 and 7', () => {
    let { state } = startDunning(failedAt);
    const second = afterFailedRetry(state);
    expect(second.next).toEqual({
      action: 'retry',
      attempt: 2,
      at: new Date('2026-03-13T09:00:00Z'),
    });
    state = second.state;
    const third = afterFailedRetry(state);
    expect(third.next).toEqual({
      action: 'retry',
      attempt: 3,
      at: new Date('2026-03-17T09:00:00Z'),
    });
  });

  it('cancels after the third failed retry', () => {
    let { state } = startDunning(failedAt);
    for (let i = 0; i < 2; i++) state = afterFailedRetry(state).state;
    expect(afterFailedRetry(state).next).toEqual({ action: 'cancel' });
  });

  it('cancels when the schedule is already exhausted', () => {
    expect(nextRetry({ retryCount: 3, startedAt: failedAt })).toEqual({ action: 'cancel' });
  });
});
