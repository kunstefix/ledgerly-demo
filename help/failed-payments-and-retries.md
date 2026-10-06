---
title: Failed payments and retries
slug: failed-payments-and-retries
visibility: public
collection: Payments
---

# Failed payments and retries

If we can't charge your card on your billing date, your subscription becomes **Past due**
and we retry the payment automatically **3 times over 7 days**:

| Retry | When                         |
| ----- | ---------------------------- |
| 1     | 1 day after the failure      |
| 2     | 3 days after the failure     |
| 3     | 7 days after the failure     |

You keep full access while we retry. Your dashboard and Billing page show the next retry
date.

## If every retry fails

After the third retry fails, the subscription is canceled and the billing invoice is
marked **Uncollectible**.

## Updating your card restarts the retries

If you add a new card while a payment is failing, we **retry the payment right away** with
the new card and **start the retry schedule over**. If the new card also fails, you get
the full 3 retries over the next 7 days again, so you have time to sort it out with your
bank. See [Updating your card](updating-your-card).

The reason for each failure is shown next to the payment. See
[Payment failure codes](payment-failure-codes) for what they mean.
