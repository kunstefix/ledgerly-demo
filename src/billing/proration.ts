// Proration when a customer changes plan in the middle of a billing period.
//
// The customer has already paid for the whole current period on the old plan. Switching
// plans charges (or credits) the price difference for the time that is left:
//
//   amount = (new price - current price) × remaining fraction of the period
//
// A positive amount is charged right away; a negative one is a credit. The period
// itself doesn't change.

export interface PlanChange {
  currentPriceCents: number;
  newPriceCents: number;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}

export function prorationAmount(change: PlanChange): number {
  const { currentPriceCents, newPriceCents, periodStart, periodEnd, changeAt } = change;
  const periodMs = periodEnd.getTime() - periodStart.getTime();
  if (periodMs <= 0) return 0;

  const at = Math.min(Math.max(changeAt.getTime(), periodStart.getTime()), periodEnd.getTime());
  const fraction = (at - periodStart.getTime()) / periodMs;

  return Math.round((newPriceCents - currentPriceCents) * fraction);
}
