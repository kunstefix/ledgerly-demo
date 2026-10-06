import type { Customer } from '../db/queries/customers.js';
import type { Invoice } from '../db/queries/invoices.js';
import { formatDueDate, isOverdue } from '../invoices/dates.js';
import type { LimitCheck } from '../invoices/limits.js';
import { badge, money } from './format.js';
import { html, type SafeHtml } from './html.js';

export function displayStatus(invoice: Invoice, customer: Customer, now: Date): string {
  if (invoice.status === 'sent' && isOverdue(invoice.dueDate, customer.timezone, now)) {
    return 'overdue';
  }
  return invoice.status;
}

export function invoiceRows(invoices: Invoice[], customer: Customer, now: Date): SafeHtml {
  return html`<table class="table">
    <thead>
      <tr>
        <th>Number</th>
        <th>Client</th>
        <th class="hide-sm">Issued</th>
        <th>Due</th>
        <th class="num">Total</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${invoices.map(
        (invoice) =>
          html`<tr>
            <td><a href="/invoices/${invoice.number}">${invoice.number}</a></td>
            <td>${invoice.clientName}</td>
            <td class="hide-sm">${formatDueDate(invoice.issueDate, customer.timezone)}</td>
            <td>${formatDueDate(invoice.dueDate, customer.timezone)}</td>
            <td class="num">${money(invoice.totalCents, invoice.currency)}</td>
            <td>${badge(displayStatus(invoice, customer, now))}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

export function invoicesPage(
  invoices: Invoice[],
  customer: Customer,
  usage: LimitCheck,
  now: Date,
): SafeHtml {
  return html`<div class="page-head">
      <div>
        <h1>Invoices</h1>
        <p class="muted">
          ${usage.limit === null
            ? html`${usage.used} this month · unlimited on your plan`
            : html`${usage.used} of ${usage.limit} this month`}
        </p>
      </div>
      <a class="button" href="/invoices/new">New invoice</a>
    </div>
    <section class="card">
      ${invoices.length === 0
        ? html`<p class="muted">No invoices yet. Create your first one.</p>`
        : invoiceRows(invoices, customer, now)}
    </section>`;
}
