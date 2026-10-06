// Invoice totals. Lines show net amounts; VAT is calculated per rate on the invoice's
// net subtotal and rounded once (half up), as most EU tax authorities expect.

export interface LineInput {
  quantity: number;
  unitPriceCents: number;
  /** Basis points: 1900 = 19%. */
  vatRateBps: number;
}

export interface Totals {
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
}

export function lineNetCents(line: LineInput): number {
  return line.quantity * line.unitPriceCents;
}

export function invoiceTotals(lines: LineInput[]): Totals {
  const subtotalCents = lines.reduce((sum, line) => sum + lineNetCents(line), 0);

  let vatCents = 0;
  for (const line of lines) {
    vatCents += Math.round((lineNetCents(line) * line.vatRateBps) / 10_000);
  }

  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}
