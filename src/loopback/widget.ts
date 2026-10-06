// The Loopback chat widget: one script tag per signed-in page.

import { html, type SafeHtml } from '../views/html.js';
import type { LoopbackConfig } from './config.js';
import { signCustomerToken, type TokenCustomer } from './token.js';

export async function widgetTag(
  config: LoopbackConfig,
  customer: TokenCustomer,
  now: Date,
): Promise<SafeHtml> {
  const token = await signCustomerToken(customer, config.identitySecret, now);
  return html`<script
    src="${config.apiPublicUrl}/widget.js"
    data-loopback-widget="${config.widgetConnectionId}"
    data-customer-token="${token}"
    async
  ></script>`;
}
