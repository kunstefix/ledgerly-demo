import type { LimitCheck } from '../invoices/limits.js';
import { html, type SafeHtml } from './html.js';

export const FORM_LINES = 3;

export interface InvoiceFormValues {
  clientName: string;
  clientEmail: string;
  issueDate: string;
  dueInDays: string;
  notes: string;
  lines: { description: string; quantity: string; unitPrice: string; vatRate: string }[];
}

export function emptyInvoiceForm(issueDate: string, vatRateBps: number): InvoiceFormValues {
  return {
    clientName: '',
    clientEmail: '',
    issueDate,
    dueInDays: '14',
    notes: '',
    lines: Array.from({ length: FORM_LINES }, () => ({
      description: '',
      quantity: '1',
      unitPrice: '',
      vatRate: String(vatRateBps / 100),
    })),
  };
}

export function invoiceFormPage(
  values: InvoiceFormValues,
  usage: LimitCheck,
  currency: string,
  error: string | null,
): SafeHtml {
  return html`<div class="page-head">
      <div>
        <p class="crumbs"><a href="/invoices">Invoices</a> /</p>
        <h1>New invoice</h1>
      </div>
    </div>
    ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : null}
    ${
      !usage.allowed
        ? html`<div class="alert">
            You've reached your plan's limit of ${usage.limit} invoices this month.
            <a href="/billing/plan">Upgrade</a> to send more.
          </div>`
        : null
    }
    <form class="card form" method="post" action="/invoices">
      <div class="form-row">
        <label>Client name <input name="clientName" required value="${values.clientName}" /></label>
        <label
          >Client email
          <input name="clientEmail" type="email" required value="${values.clientEmail}"
        /></label>
      </div>
      <div class="form-row">
        <label
          >Issue date <input name="issueDate" type="date" required value="${values.issueDate}"
        /></label>
        <label
          >Due in (days)
          <input
            name="dueInDays"
            type="number"
            min="0"
            max="120"
            required
            value="${values.dueInDays}"
        /></label>
      </div>
      <fieldset>
        <legend>Lines (${currency}, net amounts)</legend>
        ${values.lines.map(
          (line, i) =>
            html`<div class="line-row">
              <label class="grow"
                >Description <input name="line${i}Description" value="${line.description}"
              /></label>
              <label
                >Qty <input name="line${i}Quantity" type="number" min="1" value="${line.quantity}"
              /></label>
              <label
                >Unit price
                <input
                  name="line${i}UnitPrice"
                  inputmode="decimal"
                  placeholder="0.00"
                  value="${line.unitPrice}"
              /></label>
              <label
                >VAT % <input name="line${i}VatRate" inputmode="decimal" value="${line.vatRate}"
              /></label>
            </div>`,
        )}
      </fieldset>
      <label>Notes <textarea name="notes" rows="3">${values.notes}</textarea></label>
      <div class="form-actions">
        <a class="button button-secondary" href="/invoices">Cancel</a>
        <button class="button" type="submit" ${usage.allowed ? '' : 'disabled'}>Save draft</button>
      </div>
    </form>`;
}
