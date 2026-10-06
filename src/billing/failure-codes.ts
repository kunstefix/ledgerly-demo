// Payment failure codes and what they mean for the customer, in plain words.

export const FAILURE_CODES = {
  card_declined: 'Your bank declined the payment without giving a reason. Try another card or contact your bank.',
  insufficient_funds: 'The card did not have enough funds to cover the payment.',
  expired_card: 'The card has expired. Add a card with a later expiry date.',
  incorrect_cvc: 'The security code (CVC) did not match. Re-enter the card details.',
  processing_error: 'Something went wrong while processing the card. It is usually temporary; the payment will be retried.',
  authentication_required: 'Your bank asked for extra verification that could not be completed. Update the card to verify it.',
} as const;

export type FailureCode = keyof typeof FAILURE_CODES;

export function explainFailure(code: string | null | undefined): string {
  if (!code) return '';
  return (
    FAILURE_CODES[code as FailureCode] ??
    'The payment failed for an unknown reason. Contact support and we will look into it.'
  );
}

export function isFailureCode(code: string): code is FailureCode {
  return Object.hasOwn(FAILURE_CODES, code);
}
