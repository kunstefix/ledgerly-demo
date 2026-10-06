import type { Customer } from '../db/queries/customers.js';
import type { Invoice, InvoiceLine } from '../db/queries/invoices.js';
import { formatDueDate, formatTimestamp } from '../invoices/dates.js';
import { lineNetCents } from '../invoices/totals.js';
import { badge, money, percent } from './format.js';
import { html, type SafeHtml } from './html.js';
import { displayStatus } from './invoices.js';

export function invoicePage(
  invoice: Invoice,
  lines: InvoiceLine[],
  customer: Customer,
  now: Date,
): SafeHtml {
  const tz = customer.timezone;
  return html`<div class="page-head">
      <div>
        <p class="crumbs"><a href="/invoices">Invoices</a> /</p>
        <h1>${invoice.number} ${badge(displayStatus(invoice, customer, now))}</h1>
      </div>
      <div class="actions">
        ${
          invoice.status === 'draft'
            ? html`<form method="post" action="/invoices/${invoice.number}/send">
                <button class="button" type="submit">Send invoice</button>
              </form>`
            : null
        }
        ${
          invoice.status !== 'paid'
            ? html`<form method="post" action="/invoices/${invoice.number}/delete">
                <button class="button button-secondary" type="submit">Delete</button>
              </form>`
            : null
        }
      </div>
    </div>
    <section class="card invoice">
      <div class="invoice-meta">
        <div>
          <h2 class="card-title">Bill to</h2>
          <p><strong>${invoice.clientName}</strong><br />${invoice.clientEmail}</p>
        </div>
        <dl class="facts">
          <dt>Issued</dt>
          <dd>${formatDueDate(invoice.issueDate, tz)}</dd>
          <dt>Due</dt>
          <dd>${formatDueDate(invoice.dueDate, tz)}</dd>
          ${
            invoice.sentAt
              ? html`<dt>Sent</dt>
                  <dd>${formatTimestamp(invoice.sentAt, tz)}</dd>`
              : null
          }
          ${
            invoice.paidAt
              ? html`<dt>Paid</dt>
                  <dd>${formatTimestamp(invoice.paidAt, tz)}</dd>`
              : null
          }
        </dl>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Qty</th>
            <th class="num hide-sm">Unit price</th>
            <th class="num hide-sm">VAT</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lines.map(
            (line) =>
              html`<tr>
                <td>${line.description}</td>
                <td class="num">${line.quantity}</td>
                <td class="num hide-sm">${money(line.unitPriceCents, invoice.currency)}</td>
                <td class="num hide-sm">${percent(line.vatRateBps)}</td>
                <td class="num">${money(lineNetCents(line), invoice.currency)}</td>
              </tr>`,
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="hide-sm"></td>
            <td class="num">
              <dl class="totals">
                <dt>Subtotal</dt>
                <dd>${money(invoice.subtotalCents, invoice.currency)}</dd>
                <dt>VAT</dt>
                <dd>${money(invoice.vatCents, invoice.currency)}</dd>
                <dt class="total">Total</dt>
                <dd class="total">${money(invoice.totalCents, invoice.currency)}</dd>
              </dl>
            </td>
          </tr>
        </tfoot>
      </table>
      ${
        invoice.notes
          ? html`<div class="notes">
              <h2 class="card-title">Notes</h2>
              <p>${invoice.notes}</p>
            </div>`
          : null
      }
    </section>`;
}
