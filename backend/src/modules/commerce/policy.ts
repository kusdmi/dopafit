import type { Plan } from "./domain/types.js";

/**
 * A billing month is 30 days, not a calendar month.
 *
 * So the 12-month plan runs 360 days rather than a year. That is the existing behaviour and
 * is left alone deliberately — changing it would silently shorten or lengthen every
 * subscription already sold. Named here so the next reader sees a decision rather than a
 * stray multiplication.
 */
export const DAYS_PER_BILLING_MONTH = 30;

/** Premium days granted to the referrer when someone they invited qualifies. */
export const REFERRAL_BONUS_DAYS = 7;

export const MS_PER_DAY = 86_400_000;

/** Prices are in kopecks — 49900 is 499 ₽. */
export const PLANS: Record<Plan, { months: number; price: number }> = {
  m1: { months: 1, price: 49900 },
  m6: { months: 6, price: 219000 },
  m12: { months: 12, price: 359000 },
};

/** How many days a plan buys. */
export function planDays(plan: Plan): number {
  return PLANS[plan].months * DAYS_PER_BILLING_MONTH;
}
