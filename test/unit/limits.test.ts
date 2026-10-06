// Planted bug B3 lives in limits.ts (see PLANTED_BUGS.md). These tests only use issued,
// undeleted invoices and deliberately never assert how drafts or deleted ones count.
import { describe, expect, it } from 'vitest';
import { checkInvoiceLimit, monthStart, type InvoiceForLimit } from '../../src/invoices/limits.js';

const now = new Date('2026-03-20T12:00:00Z');

function sent(createdAt: string): InvoiceForLimit {
  return { status: 'sent', createdAt: new Date(createdAt), deletedAt: null };
}

describe('invoice limits', () => {
  it('starts the month at midnight UTC on the 1st', () => {
    expect(monthStart(now)).toEqual(new Date('2026-03-01T00:00:00Z'));
  });

  it('allows Starter customers under 5 invoices this month', () => {
    const invoices = [sent('2026-03-02T10:00:00Z'), sent('2026-03-05T10:00:00Z')];
    expect(checkInvoiceLimit(invoices, 5, now)).toEqual({ used: 2, limit: 5, allowed: true });
  });

  it('blocks the 6th invoice on Starter', () => {
    const invoices = Array.from({ length: 5 }, (_, i) => sent(`2026-03-0${i + 1}T10:00:00Z`));
    expect(checkInvoiceLimit(invoices, 5, now)).toEqual({ used: 5, limit: 5, allowed: false });
  });

  it('ignores invoices from previous months', () => {
    const invoices = [sent('2026-02-27T10:00:00Z'), sent('2026-02-28T23:59:00Z')];
    expect(checkInvoiceLimit(invoices, 5, now).used).toBe(0);
  });

  it('counts paid invoices', () => {
    const invoices: InvoiceForLimit[] = [
      { status: 'paid', createdAt: new Date('2026-03-03T10:00:00Z'), deletedAt: null },
    ];
    expect(checkInvoiceLimit(invoices, 200, now).used).toBe(1);
  });

  it('never blocks Business (unlimited)', () => {
    const invoices = Array.from({ length: 300 }, () => sent('2026-03-10T10:00:00Z'));
    expect(checkInvoiceLimit(invoices, null, now)).toEqual({
      used: 300,
      limit: null,
      allowed: true,
    });
  });
});
