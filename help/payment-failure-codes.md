---
title: Payment failure codes
slug: payment-failure-codes
visibility: public
collection: Payments
---

# Payment failure codes

When a payment fails, the Billing page shows a code and a short explanation.

| Code                      | What it means                                                   | What to do                                     |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `card_declined`           | Your bank declined the payment without giving a reason.         | Try another card or call your bank.            |
| `insufficient_funds`      | The card didn't have enough funds.                              | Add funds or use another card.                 |
| `expired_card`            | The card has expired.                                           | Add a card with a later expiry date.           |
| `incorrect_cvc`           | The security code didn't match.                                 | Re-enter the card details.                     |
| `processing_error`        | A temporary problem while processing the card.                  | Nothing: the payment is retried automatically. |
| `authentication_required` | Your bank wanted extra verification that couldn't be completed. | Update the card to verify it.                  |

Whatever the code, failed payments are retried automatically. See
[Failed payments and retries](failed-payments-and-retries).
