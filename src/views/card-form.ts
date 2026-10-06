import { html, type SafeHtml } from './html.js';

export function cardFormPage(error: string | null): SafeHtml {
  return html`<div class="page-head">
      <div>
        <p class="crumbs"><a href="/billing">Billing</a> /</p>
        <h1>Update card</h1>
        <p class="muted">
          Demo only: nothing is charged. Ledgerly keeps the brand, last four digits and expiry.
        </p>
      </div>
    </div>
    ${error ? html`<div class="flash flash-error" role="alert">${error}</div>` : null}
    <form class="card form narrow" method="post" action="/billing/card" autocomplete="off">
      <label>Name on card <input name="name" required /></label>
      <label
        >Card number
        <input name="number" inputmode="numeric" placeholder="4242 4242 4242 4242" required
      /></label>
      <div class="form-row">
        <label
          >Expiry month <input name="expMonth" type="number" min="1" max="12" required
        /></label>
        <label
          >Expiry year <input name="expYear" type="number" min="2024" max="2099" required
        /></label>
        <label>CVC <input name="cvc" inputmode="numeric" maxlength="4" required /></label>
      </div>
      <details class="muted">
        <summary>Test cards</summary>
        <ul>
          <li><code>4242 4242 4242 4242</code> succeeds</li>
          <li><code>4000 0000 0000 0002</code> is declined</li>
          <li><code>4000 0000 0000 9995</code> has insufficient funds</li>
          <li><code>4000 0000 0000 0069</code> is expired</li>
        </ul>
      </details>
      <div class="form-actions">
        <a class="button button-secondary" href="/billing">Cancel</a>
        <button class="button" type="submit">Save card</button>
      </div>
    </form>`;
}
