/**
 * Premium revenue scenarios (Round 07): annual gate and premium income from the seat mix.
 *
 *   general   general seats in use × average ticket × occupancy × events
 *   club      club seats in use × club price × occupancy × events
 *   suites    suites × annual suite licence
 *
 * Prices, events and occupancy are placeholders the user sets (standard manicai.revenue); MANICAI has
 * no market data. The scenarios scale the prices to show sensitivity. Not a business case: no
 * concessions, media, naming rights, sponsorship, operating costs, taxes or financing.
 */
import type { Stadium } from '../core/engine/stadium';

export interface RevenueLine { item: string; units: number; unit: string; price: number; annual: number }
export interface RevenueResult {
  currency: string;
  lines: RevenueLine[];
  annual: number;
  premium: number;
  /** premium share of annual revenue, and of capacity */
  premiumShare: number; premiumSeats: number;
  perSeat: number;
  /** low, base and high price scenarios (premium prices ×0.75 / ×1 / ×1.25) */
  scenarios: { name: string; annual: number; premium: number }[];
}

export const PRICE_SCENARIOS = [{ name: 'Low', k: 0.75 }, { name: 'Base', k: 1 }, { name: 'High', k: 1.25 }];

export function revenue(s: Stadium): RevenueResult {
  const R = s.project.studies.revenue, m = s.metrics;
  const club = m.byClass.premium ?? 0;
  const general = m.net - club;
  const suites = s.building.metrics.suites;
  const perEvent = R.events * R.occupancy;
  const lines: RevenueLine[] = [
    { item: 'General admission', units: general, unit: 'seats', price: R.ticket, annual: general * R.ticket * perEvent },
    { item: 'Club seats', units: club, unit: 'seats', price: R.club, annual: club * R.club * perEvent },
    { item: 'Suites', units: suites, unit: 'suites', price: R.suite, annual: suites * R.suite },
  ];
  const premiumAt = (k: number) => (lines[1].annual + lines[2].annual) * k;
  const annual = lines.reduce((a, l) => a + l.annual, 0), premium = premiumAt(1);
  return {
    currency: R.currency, lines, annual, premium,
    premiumShare: annual ? premium / annual : 0, premiumSeats: (club + m.suiteSeats) / Math.max(1, m.total),
    perSeat: annual / Math.max(1, m.total),
    scenarios: PRICE_SCENARIOS.map((x) => ({ name: x.name, annual: lines[0].annual + premiumAt(x.k), premium: premiumAt(x.k) })),
  };
}
