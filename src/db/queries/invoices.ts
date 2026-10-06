import type { InvoiceForLimit } from '../../invoices/limits.js';
import type { LineInput, Totals } from '../../invoices/totals.js';
import type { Db } from '../pool.js';

export type InvoiceStatus = 'draft' | 'sent' | 'paid';

export interface Invoice {
  id: number;
  number: string;
  clientName: string;
  clientEmail: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  notes: string;
  currency: 'EUR' | 'USD';
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  createdAt: Date;
  sentAt: Date | null;
  paidAt: Date | null;
}

export interface InvoiceLine extends LineInput {
  description: string;
}

const COLUMNS = `
  i.id, i.number, i.client_name AS "clientName", i.client_email AS "clientEmail",
  i.issue_date AS "issueDate", i.due_date AS "dueDate", i.status, i.notes, i.currency,
  i.subtotal_cents AS "subtotalCents", i.vat_cents AS "vatCents", i.total_cents AS "totalCents",
  i.created_at AS "createdAt", i.sent_at AS "sentAt", i.paid_at AS "paidAt"`;

export async function listInvoices(db: Db, customerId: number, limit = 500): Promise<Invoice[]> {
  const { rows } = await db.query<Invoice>(
    `SELECT ${COLUMNS} FROM invoices i
      WHERE i.customer_id = $1 AND i.deleted_at IS NULL
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT $2`,
    [customerId, limit],
  );
  return rows;
}

/** Every invoice created since `since`, including drafts and deleted ones. */
export async function invoicesCreatedSince(
  db: Db,
  customerId: number,
  since: Date,
): Promise<InvoiceForLimit[]> {
  const { rows } = await db.query<InvoiceForLimit>(
    `SELECT status, created_at AS "createdAt", deleted_at AS "deletedAt"
       FROM invoices WHERE customer_id = $1 AND created_at >= $2`,
    [customerId, since],
  );
  return rows;
}

export async function getInvoice(
  db: Db,
  customerId: number,
  number: string,
): Promise<{ invoice: Invoice; lines: InvoiceLine[] } | null> {
  const { rows } = await db.query<Invoice>(
    `SELECT ${COLUMNS} FROM invoices i
      WHERE i.customer_id = $1 AND i.number = $2 AND i.deleted_at IS NULL`,
    [customerId, number],
  );
  const invoice = rows[0];
  if (!invoice) return null;
  const lines = await db.query<InvoiceLine>(
    `SELECT description, quantity, unit_price_cents AS "unitPriceCents",
            vat_rate_bps AS "vatRateBps"
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY position`,
    [invoice.id],
  );
  return { invoice, lines: lines.rows };
}

export interface NewInvoice {
  clientName: string;
  clientEmail: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  currency: string;
  lines: InvoiceLine[];
  totals: Totals;
}

export async function createInvoice(
  db: Db,
  customerId: number,
  input: NewInvoice,
  now: Date,
): Promise<string> {
  const next = await db.query<{ n: number }>(
    `SELECT coalesce(max(substring(number FROM 5)::int), 0) + 1 AS n
       FROM invoices WHERE customer_id = $1`,
    [customerId],
  );
  const number = `INV-${String(next.rows[0]?.n ?? 1).padStart(4, '0')}`;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO invoices (customer_id, number, client_name, client_email, issue_date, due_date,
                           status, notes, currency, subtotal_cents, vat_cents, total_cents,
                           created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      customerId,
      number,
      input.clientName,
      input.clientEmail,
      input.issueDate,
      input.dueDate,
      input.notes,
      input.currency,
      input.totals.subtotalCents,
      input.totals.vatCents,
      input.totals.totalCents,
      now,
    ],
  );
  const invoiceId = rows[0]!.id;
  for (const [position, line] of input.lines.entries()) {
    await db.query(
      `INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit_price_cents,
                                  vat_rate_bps)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        invoiceId,
        position + 1,
        line.description,
        line.quantity,
        line.unitPriceCents,
        line.vatRateBps,
      ],
    );
  }
  return number;
}

export async function markInvoiceSent(
  db: Db,
  customerId: number,
  number: string,
  now: Date,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE invoices SET status = 'sent', sent_at = $3
      WHERE customer_id = $1 AND number = $2 AND status = 'draft' AND deleted_at IS NULL`,
    [customerId, number, now],
  );
  return rowCount === 1;
}

export async function deleteInvoice(
  db: Db,
  customerId: number,
  number: string,
  now: Date,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE invoices SET deleted_at = $3
      WHERE customer_id = $1 AND number = $2 AND status <> 'paid' AND deleted_at IS NULL`,
    [customerId, number, now],
  );
  return rowCount === 1;
}
