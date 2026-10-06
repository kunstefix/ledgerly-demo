import { describe, expect, it } from 'vitest';
import { chargeOutcome, isValidCardNumber } from '../../src/billing/charge.js';
import { explainFailure, FAILURE_CODES, isFailureCode } from '../../src/billing/failure-codes.js';

describe('failure codes', () => {
  it('explains every known code in plain words', () => {
    for (const [code, text] of Object.entries(FAILURE_CODES)) {
      expect(explainFailure(code)).toBe(text);
      expect(text.length).toBeGreaterThan(20);
    }
  });

  it('falls back for unknown codes and is empty without one', () => {
    expect(explainFailure('something_new')).toMatch(/unknown reason/);
    expect(explainFailure(null)).toBe('');
  });

  it('only produces known codes from fake charges', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    for (const last4 of ['0002', '9995', '0069', '0127', '0119', '3155']) {
      const outcome = chargeOutcome({ brand: 'Visa', last4, expMonth: 12, expYear: 2030 }, now);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(isFailureCode(outcome.failureCode)).toBe(true);
    }
  });

  it('succeeds with a normal card and fails with an expired one', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    const card = { brand: 'Visa', last4: '4242', expMonth: 12, expYear: 2030 };
    expect(chargeOutcome(card, now)).toEqual({ ok: true });
    expect(chargeOutcome({ ...card, expYear: 2026, expMonth: 9 }, now)).toEqual({
      ok: false,
      failureCode: 'expired_card',
    });
  });

  it('validates card numbers with the Luhn checksum', () => {
    expect(isValidCardNumber('4242424242424242')).toBe(true);
    expect(isValidCardNumber('4000000000000002')).toBe(true);
    expect(isValidCardNumber('4242424242424241')).toBe(false);
    expect(isValidCardNumber('42')).toBe(false);
  });
});
