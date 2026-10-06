// Planted bug B4 lives in totals.ts (see PLANTED_BUGS.md). These tests use single lines
// or amounts that round the same either way, and deliberately never assert a multi-line
// rounding case.
import { describe, expect, it } from 'vitest';
import { invoiceTotals, lineNetCents } from '../../src/invoices/totals.js';

describe('invoice totals', () => {
  it('multiplies quantity by unit price for the line net', () => {
    expect(lineNetCents({ quantity: 3, unitPriceCents: 1250, vatRateBps: 1900 })).toBe(3750);
  });

  it('adds VAT to a single line', () => {
    expect(invoiceTotals([{ quantity: 1, unitPriceCents: 10000, vatRateBps: 1900 }])).toEqual({
      subtotalCents: 10000,
      vatCents: 1900,
      totalCents: 11900,
    });
  });

  it('rounds VAT half up', () => {
    // 2.50 × 19% = 0.475 → 0.48
    expect(invoiceTotals([{ quantity: 1, unitPriceCents: 250, vatRateBps: 1900 }]).vatCents).toBe(
      48,
    );
  });

  it('charges no VAT at a zero rate', () => {
    expect(
      invoiceTotals([
        { quantity: 2, unitPriceCents: 4999, vatRateBps: 0 },
        { quantity: 1, unitPriceCents: 1, vatRateBps: 0 },
      ]),
    ).toEqual({ subtotalCents: 9999, vatCents: 0, totalCents: 9999 });
  });

  it('handles an empty invoice', () => {
    expect(invoiceTotals([])).toEqual({ subtotalCents: 0, vatCents: 0, totalCents: 0 });
  });
});
