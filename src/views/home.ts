import type { CustomerListItem } from '../db/queries/customers.js';
import { badge } from './format.js';
import { html, type SafeHtml } from './html.js';

// What each demo persona is good for, shown on the sign-in page.
const DEMO_HINTS: Record<string, string> = {
  cus_maple: 'Says the monthly invoice limit kicked in too early',
  cus_alder: 'Upgraded plans late in the month and the charge looks high',
  cus_fjord: 'Card was declined; a retry is pending',
  cus_lumen: 'Updated their card and was canceled anyway',
  cus_kestrel: 'Thinks the VAT on an invoice is a cent off',
  cus_tidewater: 'Clients say due dates look wrong',
  cus_sable: 'Wants to know when the next payment is due',
};

export function homePage(customers: CustomerListItem[]): SafeHtml {
  return html`<section class="hero">
      <h1>Sign in to the Ledgerly demo</h1>
      <p class="lead">
        Pick a customer to browse their account and chat with support. There are no passwords:
        this is a demo and everything here is fake.
      </p>
    </section>
    <div class="card">
      <table class="table customers">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Plan</th>
            <th class="hide-sm">Country</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${customers.map(
            (c) =>
              html`<tr>
                <td>
                  <strong>${c.companyName}</strong>
                  <div class="muted">${c.contactName} · <code>${c.externalId}</code></div>
                  ${DEMO_HINTS[c.externalId]
                    ? html`<div class="hint">${DEMO_HINTS[c.externalId]}</div>`
                    : null}
                </td>
                <td>${c.planName} ${c.subscriptionStatus !== 'active' ? badge(c.subscriptionStatus) : null}</td>
                <td class="hide-sm">${c.country}</td>
                <td class="actions">
                  <form method="post" action="/session">
                    <input type="hidden" name="customer" value="${c.externalId}" />
                    <button class="button" type="submit">Sign in as</button>
                  </form>
                </td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>`;
}
