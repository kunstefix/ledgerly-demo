import { isExpired, type CardOnFile } from '../billing/charge.js';
import { explainFailure } from '../billing/failure-codes.js';
import type { BillingInvoice, Payment, ScheduledRetry } from '../db/queries/billing.js';
import type { Customer } from '../db/queries/customers.js';
import { planPrice, type Plan, type Subscription } from '../db/queries/subscriptions.js';
import { formatDay, formatTimestamp } from '../invoices/dates.js';
import { badge, intervalLabel, money, perInterval } from './format.js';
import { html, type SafeHtml } from './html.js';

export interface BillingProps {
  customer: Customer;
  subscription: Subscription;
  card: CardOnFile | null;
  billingInvoices: BillingInvoice[];
  payments: Payment[];
  retries: ScheduledRetry[];
  now: Date;
}

function cardSummary(card: CardOnFile | null, now: Date): SafeHtml {
  if (!card) return html`<p class="muted">No card on file.</p>`;
  return html`<p class="stat-sm">${card.brand} ending in ${card.last4}</p>
    <p class="muted">
      Expires ${String(card.expMonth).padStart(2, '0')}/${card.expYear}
      ${isExpired(card, now) ? badge('expired') : null}
    </p>`;
}

export function billingPage(props: BillingProps): SafeHtml {
  const { customer, subscription, card, billingInvoices, payments, retries, now } = props;
  const tz = customer.timezone;
  const price = planPrice(subscription.plan, subscription.billingInterval);
  const failing = billingInvoices.find((invoice) => invoice.status === 'open');

  return html`<div class="page-head"><h1>Billing</h1></div>
    ${failing
      ? html`<div class="alert">
          We couldn't collect ${money(failing.amountCents, failing.currency)} for
          ${failing.number}.
          ${retries[0]
            ? html`Retry ${retries[0].attempt} of 3 is scheduled for
              ${formatTimestamp(retries[0].scheduledFor, tz)}.`
            : null}
          <a href="/billing/card">Update your card</a> to retry now.
        </div>`
      : null}
    <div class="grid grid-2">
      <section class="card">
        <h2 class="card-title">Subscription</h2>
        <p class="stat-sm">${subscription.plan.name} ${badge(subscription.status)}</p>
        <p class="muted">
          ${price === 0
            ? 'Free'
            : html`${money(price, customer.currency)}${perInterval(subscription.billingInterval)}`}
          · ${intervalLabel(subscription.billingInterval)}
        </p>
        <p class="muted">
          ${subscription.status === 'canceled' && subscription.canceledAt
            ? html`Canceled on ${formatDay(subscription.canceledAt, tz)}.`
            : html`Current period ${formatDay(subscription.currentPeriodStart, tz)} –
              ${formatDay(subscription.currentPeriodEnd, tz)}`}
        </p>
        <a class="button button-secondary" href="/billing/plan">
          ${subscription.status === 'canceled' ? 'Restart subscription' : 'Change plan'}
        </a>
      </section>
      <section class="card">
        <h2 class="card-title">Payment method</h2>
        ${cardSummary(card, now)}
        <a class="button button-secondary" href="/billing/card">Update card</a>
      </section>
    </div>
    <section class="card">
      <h2 class="card-title">Billing invoices</h2>
      ${billingInvoices.length === 0
        ? html`<p class="muted">Nothing billed yet.</p>`
        : html`<table class="table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                <th class="hide-sm">Description</th>
                <th class="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${billingInvoices.map(
                (invoice) =>
                  html`<tr>
                    <td>${invoice.number}</td>
                    <td>${formatDay(invoice.createdAt, tz)}</td>
                    <td class="hide-sm">${invoice.description}</td>
                    <td class="num">${money(invoice.amountCents, invoice.currency)}</td>
                    <td>${badge(invoice.status)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>`}
    </section>
    <section class="card">
      <h2 class="card-title">Payments</h2>
      ${payments.length === 0
        ? html`<p class="muted">No payments yet.</p>`
        : html`<table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th class="hide-sm">Invoice</th>
                <th class="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(
                (payment) =>
                  html`<tr>
                    <td>${formatTimestamp(payment.attemptedAt, tz)}</td>
                    <td class="hide-sm">${payment.billingInvoiceNumber}</td>
                    <td class="num">${money(payment.amountCents, payment.currency)}</td>
                    <td>
                      ${badge(payment.status)}
                      ${payment.failureCode
                        ? html`<div class="failure">
                            <code>${payment.failureCode}</code> ${explainFailure(payment.failureCode)}
                          </div>`
                        : null}
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>`}
    </section>`;
}

export function planPage(
  customer: Customer,
  subscription: Subscription,
  plans: Plan[],
): SafeHtml {
  const interval = subscription.billingInterval;
  const canceled = subscription.status === 'canceled';
  return html`<div class="page-head">
      <div>
        <p class="crumbs"><a href="/billing">Billing</a> /</p>
        <h1>${canceled ? 'Restart subscription' : 'Change plan'}</h1>
        <p class="muted">
          ${canceled
            ? 'Your new period starts today.'
            : 'Upgrades are charged right away for the rest of this period; downgrades leave a credit.'}
        </p>
      </div>
    </div>
    <div class="grid">
      ${plans.map((plan) => {
        const current = plan.id === subscription.plan.id && !canceled;
        const price = planPrice(plan, interval);
        return html`<section class="card plan ${current ? 'plan-current' : ''}">
          <h2 class="card-title">${plan.name}</h2>
          <p class="stat">
            ${price === 0 ? 'Free' : money(price, customer.currency)}<span class="stat-of"
              >${price === 0 ? '' : perInterval(interval)}</span
            >
          </p>
          <p class="muted">
            ${plan.monthlyInvoiceLimit === null
              ? 'Unlimited invoices'
              : `${plan.monthlyInvoiceLimit} invoices a month`}
          </p>
          ${current
            ? html`<p class="muted"><strong>Current plan</strong></p>`
            : html`<form method="post" action="/billing/plan">
                <input type="hidden" name="plan" value="${plan.id}" />
                <button class="button" type="submit">Switch to ${plan.name}</button>
              </form>`}
        </section>`;
      })}
    </div>`;
}
