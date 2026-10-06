import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import type { Customer } from '../db/queries/customers.js';
import {
  createInvoice,
  deleteInvoice,
  getInvoice,
  invoicesCreatedSince,
  listInvoices,
  markInvoiceSent,
  type InvoiceLine,
} from '../db/queries/invoices.js';
import { getSubscription } from '../db/queries/subscriptions.js';
import type { Db } from '../db/pool.js';
import { addDays, todayIn } from '../invoices/dates.js';
import { checkInvoiceLimit, monthStart, type LimitCheck } from '../invoices/limits.js';
import { invoiceTotals } from '../invoices/totals.js';
import { requireCustomer, signedInCustomer } from '../session.js';
import { invoicePage } from '../views/invoice.js';
import {
  emptyInvoiceForm,
  FORM_LINES,
  invoiceFormPage,
  type InvoiceFormValues,
} from '../views/invoice-form.js';
import { invoicesPage } from '../views/invoices.js';

type Body = Record<string, string | undefined>;

async function usageFor(db: Db, customer: Customer, now: Date): Promise<LimitCheck> {
  const subscription = await getSubscription(db, customer.id);
  const invoices = await invoicesCreatedSince(db, customer.id, monthStart(now));
  return checkInvoiceLimit(invoices, subscription?.plan.monthlyInvoiceLimit ?? 0, now);
}

function formValues(body: Body): InvoiceFormValues {
  return {
    clientName: body.clientName?.trim() ?? '',
    clientEmail: body.clientEmail?.trim() ?? '',
    issueDate: body.issueDate ?? '',
    dueInDays: body.dueInDays ?? '',
    notes: body.notes?.trim() ?? '',
    lines: Array.from({ length: FORM_LINES }, (_, i) => ({
      description: body[`line${i}Description`]?.trim() ?? '',
      quantity: body[`line${i}Quantity`] ?? '',
      unitPrice: body[`line${i}UnitPrice`] ?? '',
      vatRate: body[`line${i}VatRate`] ?? '',
    })),
  };
}

/** "12", "12.5", "12,50" → cents. */
export function parseCents(text: string): number | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** "19", "7.7" → basis points. */
export function parseVatRate(text: string): number | null {
  const match = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

function parseInvoice(
  values: InvoiceFormValues,
): { lines: InvoiceLine[]; dueDate: string } | { error: string } {
  if (!values.clientName) return { error: 'Add the client name.' };
  if (!/^[^\s@]+@[^\s@]+$/.test(values.clientEmail)) return { error: 'Add a valid client email.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.issueDate)) return { error: 'Add an issue date.' };
  const dueInDays = Number(values.dueInDays);
  if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 120) {
    return { error: 'Due in must be between 0 and 120 days.' };
  }

  const lines: InvoiceLine[] = [];
  for (const [i, line] of values.lines.entries()) {
    if (!line.description && !line.unitPrice) continue;
    const quantity = Number(line.quantity);
    const unitPriceCents = parseCents(line.unitPrice);
    const vatRateBps = parseVatRate(line.vatRate || '0');
    if (!line.description) return { error: `Line ${i + 1} needs a description.` };
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: `Line ${i + 1} needs a whole quantity of at least 1.` };
    }
    if (unitPriceCents === null) return { error: `Line ${i + 1} needs a price like 120.00.` };
    if (vatRateBps === null) return { error: `Line ${i + 1} needs a VAT rate like 19.` };
    lines.push({ description: line.description, quantity, unitPriceCents, vatRateBps });
  }
  if (lines.length === 0) return { error: 'Add at least one line.' };
  return { lines, dueDate: addDays(values.issueDate, dueInDays) };
}

export async function invoiceRoutes(app: FastifyInstance, { pool, config }: AppDeps) {
  app.addHook('preHandler', requireCustomer);

  app.get('/invoices', async (request, reply) => {
    const customer = signedInCustomer(request);
    const now = config.now();
    return reply.page(request, {
      title: 'Invoices',
      section: 'invoices',
      body: invoicesPage(
        await listInvoices(pool, customer.id),
        customer,
        await usageFor(pool, customer, now),
        now,
      ),
    });
  });

  app.get('/invoices/new', async (request, reply) => {
    const customer = signedInCustomer(request);
    const now = config.now();
    return reply.page(request, {
      title: 'New invoice',
      section: 'invoices',
      body: invoiceFormPage(
        emptyInvoiceForm(todayIn(customer.timezone, now), customer.defaultVatRateBps),
        await usageFor(pool, customer, now),
        customer.currency,
        null,
      ),
    });
  });

  app.post<{ Body: Body }>('/invoices', async (request, reply) => {
    const customer = signedInCustomer(request);
    const now = config.now();
    const values = formValues(request.body ?? {});
    const usage = await usageFor(pool, customer, now);

    const parsed = usage.allowed
      ? parseInvoice(values)
      : { error: `You've reached your plan's limit of ${usage.limit} invoices this month.` };
    if ('error' in parsed) {
      return reply.page(request, {
        title: 'New invoice',
        section: 'invoices',
        status: 422,
        body: invoiceFormPage(values, usage, customer.currency, parsed.error),
      });
    }

    const number = await createInvoice(
      pool,
      customer.id,
      {
        clientName: values.clientName,
        clientEmail: values.clientEmail,
        issueDate: values.issueDate,
        dueDate: parsed.dueDate,
        notes: values.notes,
        currency: customer.currency,
        lines: parsed.lines,
        totals: invoiceTotals(parsed.lines),
      },
      now,
    );
    return reply.redirect(`/invoices/${number}?notice=invoice-created`);
  });

  app.get<{ Params: { number: string } }>('/invoices/:number', async (request, reply) => {
    const customer = signedInCustomer(request);
    const found = await getInvoice(pool, customer.id, request.params.number);
    if (!found) {
      return reply.page(request, {
        title: 'Not found',
        section: 'invoices',
        status: 404,
        body: invoicesPage([], customer, await usageFor(pool, customer, config.now()), config.now()),
        flash: { kind: 'error', text: 'That invoice does not exist.' },
      });
    }
    return reply.page(request, {
      title: found.invoice.number,
      section: 'invoices',
      body: invoicePage(found.invoice, found.lines, customer, config.now()),
    });
  });

  app.post<{ Params: { number: string } }>('/invoices/:number/send', async (request, reply) => {
    const customer = signedInCustomer(request);
    await markInvoiceSent(pool, customer.id, request.params.number, config.now());
    return reply.redirect(`/invoices/${request.params.number}?notice=invoice-sent`);
  });

  app.post<{ Params: { number: string } }>('/invoices/:number/delete', async (request, reply) => {
    const customer = signedInCustomer(request);
    await deleteInvoice(pool, customer.id, request.params.number, config.now());
    return reply.redirect('/invoices?notice=invoice-deleted');
  });
}
