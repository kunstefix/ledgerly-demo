---
title: How VAT is calculated
slug: vat-on-invoices
visibility: public
collection: Invoicing
---

# How VAT is calculated

Invoice lines show **net** amounts (quantity × unit price). Ledgerly then:

1. Adds up the net amounts of all lines into the **subtotal**.
2. Calculates VAT **once on the subtotal** for each VAT rate, rounding half up to the cent.
3. Adds VAT to the subtotal for the **total**.

Calculating VAT on the subtotal, rather than line by line, is what most EU tax authorities
expect, and it means the VAT always equals the rate applied to the subtotal.

> Example: two lines of €12.50 at 19%. Subtotal €25.00, VAT 19% × €25.00 = **€4.75**,
> total **€29.75**.

If an invoice mixes VAT rates, VAT is calculated per rate on the subtotal of the lines with
that rate.

Customers outside the EU (for example in the US or Canada) start with a 0% rate; change it
per line if you need to.
