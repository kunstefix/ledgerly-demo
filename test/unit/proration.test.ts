// Planted bug B1 lives in proration.ts (see PLANTED_BUGS.md). These tests cover the
// paths the bug doesn't change and deliberately never assert a mid-period change.
import { describe, expect, it } from 'vitest';
import { prorationAmount } from '../../src/billing/proration.js';

const periodStart = new Date('2026-03-01T00:00:00Z');
const periodEnd = new Date('2026-03-31T00:00:00Z');

describe('prorationAmount', () => {
  it('charges nothing when the plan price is unchanged', () => {
    expect(
      prorationAmount({
        currentPriceCents: 2900,
        newPriceCents: 2900,
        periodStart,
        periodEnd,
        changeAt: new Date('2026-03-01T00:00:00Z'),
      }),
    ).toBe(0);
  });

  it('never credits an upgrade or charges more than the full difference', () => {
    const amount = prorationAmount({
      currentPriceCents: 2900,
      newPriceCents: 9900,
      periodStart,
      periodEnd,
      changeAt: new Date('2026-03-16T00:00:00Z'),
    });
    expect(amount).toBeGreaterThanOrEqual(0);
    expect(amount).toBeLessThanOrEqual(9900 - 2900);
  });

  it('never charges for a downgrade', () => {
    const amount = prorationAmount({
      currentPriceCents: 9900,
      newPriceCents: 2900,
      periodStart,
      periodEnd,
      changeAt: new Date('2026-03-16T00:00:00Z'),
    });
    expect(amount).toBeLessThanOrEqual(0);
  });

  it('returns 0 for an empty period', () => {
    expect(
      prorationAmount({
        currentPriceCents: 0,
        newPriceCents: 9900,
        periodStart,
        periodEnd: periodStart,
        changeAt: periodStart,
      }),
    ).toBe(0);
  });
});
