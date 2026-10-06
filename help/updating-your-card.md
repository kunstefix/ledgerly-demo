---
title: Updating your card
slug: updating-your-card
visibility: public
collection: Payments
---

# Updating your card

Go to **Billing → Update card** and enter the new card. Ledgerly stores only the card
brand, the last four digits and the expiry date.

## If a payment is failing

Saving a new card while a payment is past due:

1. Retries the outstanding payment **immediately** with the new card.
2. **Resets the retry schedule.** If the new card fails too, you get a fresh set of 3
   retries over 7 days. Updating your card never makes a cancellation happen sooner.

If the immediate payment goes through, your subscription is active again straight away.

## Test cards (demo)

Ledgerly is a demo, so no real card is charged. These numbers behave like real-world
outcomes:

- `4242 4242 4242 4242` succeeds
- `4000 0000 0000 0002` is declined
- `4000 0000 0000 9995` has insufficient funds
- `4000 0000 0000 0069` is expired
