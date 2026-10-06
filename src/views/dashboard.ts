import type { BillingInvoice, ScheduledRetry } from '../db/queries/billing.js';
import type { Customer } from '../db/queries/customers.js';
import type { Invoice } from '../db/queries/invoices.js';
import { planPrice, type Subscription } from '../db/queries/subscriptions.js';
import { formatDay } from '../invoices/dates.js';
import type { LimitCheck } from '../invoices/limits.js';
import { badge, intervalLabel, money, perInterval } from './format.js';
import { html, type SafeHtml } from './html.js';
import { invoiceRows } from './invoices.js';

export interface DashboardProps {
  customer: Customer;
  subscription: Subscription;
  usage: LimitCheck;
  openInvoice: BillingInvoice | null;
  nextRetry: ScheduledRetry | null;
  recentInvoices: Invoice[];
  now: Date;
}

function usageMeter(usage: LimitCheck): SafeHtml {
  if (usage.limit === null) {
    return html`<p class="stat">${usage.used}</p>
      <p class="muted">invoices this month · unlimited</p>`;
  }
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return html`<p class="stat">${usage.used} <span class="stat-of">/ ${usage.limit}</span></p>
    <div class="meter ${usage.allowed ? '' : 'meter-full'}">
      <span style="width: ${pct}%"></span>
    </div>
    <p class="muted">
      ${usage.allowed ? 'invoices this month' : "You've reached this month's invoice limit."}
    </p>`;
}

function nextPayment(props: DashboardProps): SafeHtml {
  const { subscription, customer, openInvoice, nextRetry } = props;
  if (subscription.status === 'canceled') {
    return html`<p class="stat">None</p>
      <p class="muted">The subscription is canceled.</p>`;
  }
  if (openInvoice) {
    return html`<p class="stat danger">${money(openInvoice.amountCents, openInvoice.currency)}</p>
      <p class="muted">
        Payment failed.
        ${
          nextRetry
            ? html`We'll retry on ${formatDay(nextRetry.scheduledFor, customer.timezone)}.`
            : null
        }
        <a href="/billing/card">Update card</a>
      </p>`;
  }
  const price = planPrice(subscription.plan, subscription.billingInterval);
  if (price === 0) {
    return html`<p class="stat">Free</p>
      <p class="muted">Starter has no payments.</p>`;
  }
  return html`<p class="stat">${money(price, customer.currency)}</p>
    <p class="muted">on ${formatDay(subscription.currentPeriodEnd, customer.timezone)}</p>`;
}

export function dashboardPage(props: DashboardProps): SafeHtml {
  const { customer, subscription, usage, recentInvoices, now } = props;
  const price = planPrice(subscription.plan, subscription.billingInterval);
  return html`<div class="page-head">
      <div>
        <h1>Welcome back, ${customer.contactName.split(' ')[0]}</h1>
        <p class="muted">${customer.companyName}</p>
      </div>
      <a class="button" href="/invoices/new">New invoice</a>
    </div>
    ${
      props.openInvoice
        ? html`<div class="alert">
            A payment of ${money(props.openInvoice.amountCents, props.openInvoice.currency)} failed.
            <a href="/billing">See billing</a>
          </div>`
        : null
    }
    <div class="grid">
      <section class="card">
        <h2 class="card-title">Plan</h2>
        <p class="stat">${subscription.plan.name} ${badge(subscription.status)}</p>
        <p class="muted">
          ${
            price === 0
              ? 'Free'
              : html`${money(price, customer.currency)}${perInterval(subscription.billingInterval)}
                · ${intervalLabel(subscription.billingInterval)}`
          }
          · <a href="/billing/plan">Change plan</a>
        </p>
      </section>
      <section class="card">
        <h2 class="card-title">Usage</h2>
        ${usageMeter(usage)}
      </section>
      <section class="card">
        <h2 class="card-title">Next payment</h2>
        ${nextPayment(props)}
      </section>
    </div>
    <section class="card">
      <div class="card-head">
        <h2 class="card-title">Recent invoices</h2>
        <a href="/invoices">View all</a>
      </div>
      ${
        recentInvoices.length === 0
          ? html`<p class="muted">No invoices yet.</p>`
          : invoiceRows(recentInvoices, customer, now)
      }
    </section>`;
}
