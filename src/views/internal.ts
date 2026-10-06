import type { TickSummary } from '../billing/tick.js';
import { html, type SafeHtml } from './html.js';

export function internalPage(result: TickSummary | null): SafeHtml {
  return html`<div class="page-head">
      <div>
        <h1>Internal tools</h1>
        <p class="muted">For the demo. A real Ledgerly would run this job every night.</p>
      </div>
    </div>
    <section class="card">
      <h2 class="card-title">Daily billing job</h2>
      <p>
        Renews subscriptions whose period has ended and runs payment retries that are due, so
        failed payments move along.
      </p>
      ${result
        ? html`<p class="flash flash-ok">
            Renewed ${result.renewed} subscriptions. Retries: ${result.succeeded} succeeded,
            ${result.failed} failed, ${result.canceled} subscriptions canceled.
          </p>`
        : null}
      <form method="post" action="/internal/billing-tick">
        <button class="button" type="submit">Run billing job now</button>
      </form>
    </section>`;
}
