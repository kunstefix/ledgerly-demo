// Dates on invoices.
//
// Issue and due dates are calendar dates ("2026-10-20"), not instants: an invoice due on
// the 20th is due on the 20th wherever the customer or their client is. Timestamps
// (when something was sent or paid) are instants and are shown in the customer's
// timezone.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a calendar date like "Oct 20, 2026". */
export function formatDueDate(isoDate: string, _timezone: string): string {
  const match = DATE_RE.exec(isoDate);
  if (!match) return isoDate;
  const [, y, m, d] = match;
  const asUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(asUtc);
}

/** Formats an instant in the customer's timezone, like "Oct 20, 2026, 3:04 PM". */
export function formatTimestamp(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

/** Formats an instant as a date only in the customer's timezone. */
export function formatDay(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(at);
}

/** Today's calendar date in the customer's timezone, as "YYYY-MM-DD". */
export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const match = DATE_RE.exec(isoDate);
  if (!match) throw new Error(`Not a date: ${isoDate}`);
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days));
  return date.toISOString().slice(0, 10);
}

/** Whether a sent invoice is past its due date, in the customer's timezone. */
export function isOverdue(dueDate: string, timezone: string, now: Date): boolean {
  return dueDate < todayIn(timezone, now);
}
