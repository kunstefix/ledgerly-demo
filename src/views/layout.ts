import type { Customer } from '../db/queries/customers.js';
import type { LoopbackConfig } from '../loopback/config.js';
import { html, type SafeHtml } from './html.js';

export type Section = 'dashboard' | 'invoices' | 'billing';

export interface Flash {
  kind: 'ok' | 'error';
  text: string;
}

export interface LayoutProps {
  title: string;
  body: SafeHtml;
  customer?: Customer | null;
  section?: Section;
  loopback?: LoopbackConfig | null;
  widget?: SafeHtml | null;
  flash?: Flash | null;
}

function navLink(href: string, label: string, active: boolean): SafeHtml {
  return html`<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
}

export function layout(props: LayoutProps): SafeHtml {
  const { title, body, customer, section, loopback, widget, flash } = props;
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Ledgerly</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="topbar-inner">
        <a class="brand" href="${customer ? '/dashboard' : '/'}"
          ><span class="brand-mark">L</span> Ledgerly</a
        >
        ${customer
          ? html`<nav class="mainnav">
                ${navLink('/dashboard', 'Dashboard', section === 'dashboard')}
                ${navLink('/invoices', 'Invoices', section === 'invoices')}
                ${navLink('/billing', 'Billing', section === 'billing')}
                ${loopback?.helpCenterUrl
                  ? html`<a href="${loopback.helpCenterUrl}" target="_blank" rel="noopener"
                      >Help</a
                    >`
                  : null}
              </nav>
              <div class="account">
                <span class="account-name">${customer.companyName}</span>
                <form method="post" action="/session/delete">
                  <button class="link-button" type="submit">Sign out</button>
                </form>
              </div>`
          : null}
      </div>
    </header>
    ${customer && !loopback
      ? html`<div class="banner">
          Support chat isn't configured. Start Loopback's demo profile, or set the
          <code>LOOPBACK_*</code> settings, to enable it.
        </div>`
      : null}
    <main class="page">
      ${flash ? html`<div class="flash flash-${flash.kind}" role="status">${flash.text}</div>` : null}
      ${body}
    </main>
    <footer class="footer">
      Ledgerly is a demo app. Every customer, invoice and payment here is fake.
      <a href="/internal">Internal tools</a>
    </footer>
    ${widget ?? null}
  </body>
</html>`;
}
