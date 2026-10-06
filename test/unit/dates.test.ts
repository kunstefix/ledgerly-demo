// Planted bug B5 lives in dates.ts (see PLANTED_BUGS.md). These tests use customers at
// or east of UTC and deliberately never assert a due date west of UTC.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDueDate,
  formatTimestamp,
  isOverdue,
  todayIn,
} from '../../src/invoices/dates.js';

describe('invoice dates', () => {
  it('shows a due date as the same calendar date in UTC', () => {
    expect(formatDueDate('2026-10-20', 'UTC')).toBe('Oct 20, 2026');
  });

  it('shows a due date as the same calendar date east of UTC', () => {
    expect(formatDueDate('2026-10-20', 'Europe/Berlin')).toBe('Oct 20, 2026');
    expect(formatDueDate('2026-01-01', 'Europe/Ljubljana')).toBe('Jan 1, 2026');
  });

  it('formats timestamps in the customer timezone', () => {
    const at = new Date('2026-10-20T22:30:00Z');
    expect(formatTimestamp(at, 'Europe/Berlin')).toBe('Oct 21, 2026, 12:30 AM');
  });

  it('knows today in the customer timezone', () => {
    const at = new Date('2026-10-20T23:30:00Z');
    expect(todayIn('Europe/Berlin', at)).toBe('2026-10-21');
    expect(todayIn('UTC', at)).toBe('2026-10-20');
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-01-25', 14)).toBe('2026-02-08');
  });

  it('marks invoices overdue only after the due date', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(isOverdue('2026-10-20', 'UTC', now)).toBe(false);
    expect(isOverdue('2026-10-19', 'UTC', now)).toBe(true);
  });
});
