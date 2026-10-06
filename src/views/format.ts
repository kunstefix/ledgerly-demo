import { html, type SafeHtml } from './html.js';

/** Formats an amount in minor units (cents) as currency, like "€29.00". */
export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function percent(bps: number): string {
  return `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

const BADGE_LABELS: Record<string, string> = {
  past_due: 'Past due',
  uncollectible: 'Uncollectible',
};

export function badge(status: string): SafeHtml {
  const label = BADGE_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
  return html`<span class="badge badge-${status}">${label}</span>`;
}

export function intervalLabel(interval: 'month' | 'year'): string {
  return interval === 'year' ? 'Annual' : 'Monthly';
}

export function perInterval(interval: 'month' | 'year'): string {
  return interval === 'year' ? '/yr' : '/mo';
}
