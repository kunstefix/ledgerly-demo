// Fake card charges. Nothing leaves the app: the outcome depends only on the card,
// using the same test numbers as common payment processors.

import type { FailureCode } from './failure-codes.js';

export interface CardOnFile {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export type ChargeOutcome = { ok: true } | { ok: false; failureCode: FailureCode };

const FAILING_LAST4: Record<string, FailureCode> = {
  '0002': 'card_declined',
  '9995': 'insufficient_funds',
  '0069': 'expired_card',
  '0127': 'incorrect_cvc',
  '0119': 'processing_error',
  '3155': 'authentication_required',
};

export function chargeOutcome(card: CardOnFile | null, now: Date): ChargeOutcome {
  if (!card) return { ok: false, failureCode: 'card_declined' };
  const failure = FAILING_LAST4[card.last4];
  if (failure) return { ok: false, failureCode: failure };
  if (isExpired(card, now)) return { ok: false, failureCode: 'expired_card' };
  return { ok: true };
}

export function isExpired(card: CardOnFile, now: Date): boolean {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return card.expYear < year || (card.expYear === year && card.expMonth < month);
}

export function cardBrand(number: string): string {
  if (number.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'American Express';
  return 'Card';
}

/** Luhn checksum, so the fake card form still rejects typos. */
export function isValidCardNumber(number: string): boolean {
  if (!/^\d{12,19}$/.test(number)) return false;
  let sum = 0;
  for (let i = 0; i < number.length; i++) {
    let digit = Number(number[number.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
