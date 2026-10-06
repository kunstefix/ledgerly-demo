// Monthly invoice limits per plan.
//
// Starter can send 5 invoices a calendar month (UTC), Pro 200, Business is unlimited.
// Only invoices that were actually issued count: drafts and deleted invoices don't.

export interface InvoiceForLimit {
  status: 'draft' | 'sent' | 'paid';
  createdAt: Date;
  deletedAt: Date | null;
}

export interface LimitCheck {
  used: number;
  /** null when the plan is unlimited. */
  limit: number | null;
  allowed: boolean;
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function countsTowardLimit(invoice: InvoiceForLimit, now: Date): boolean {
  if (invoice.createdAt < monthStart(now)) return false;
  return invoice.status !== 'draft' && invoice.deletedAt === null;
}

export function checkInvoiceLimit(
  invoices: InvoiceForLimit[],
  limit: number | null,
  now: Date,
): LimitCheck {
  const used = invoices.filter((invoice) => countsTowardLimit(invoice, now)).length;
  return { used, limit, allowed: limit === null || used < limit };
}
