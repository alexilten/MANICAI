/**
 * Capacity fitting. The target is reached by changing row counts — a real geometric move that
 * keeps the plan, the sightline rules and the seat module — never by scaling seat arrays.
 * Rows are added or removed in proportion across tiers; the result is the closest achievable
 * capacity, reported honestly when the target cannot be met within the row limits.
 */
import type { Project } from '../schema';
import { makeRing } from './plan';
import { solveProfiles } from './profile';
import { countSeats } from './seats';
import { SPORTS } from '../sports';

export const ROWS_MIN = 3;
export const ROWS_MAX = 70;

export function capacityOf(p: Project): number {
  const f = SPORTS[p.sport].build(p.field);
  const ring = makeRing(f.length, f.width, p.bowl.sideDistance, p.bowl.endDistance, p.bowl.cornerRadius);
  return countSeats(p, ring, solveProfiles(p, ring));
}

export interface FitResult { rows: number[]; capacity: number; reached: boolean }

export function fitRowsToTarget(p: Project, target = p.bowl.targetCapacity): FitResult {
  const base = p.tiers.map((t) => Math.max(ROWS_MIN, t.rows));
  const withRows = (rows: number[]) => ({ ...p, tiers: p.tiers.map((t, i) => ({ ...t, rows: rows[i] })) });
  const rowsAt = (k: number) => base.map((r) => Math.min(ROWS_MAX, Math.max(ROWS_MIN, Math.round(r * k))));
  // bisection on a common scale factor (capacity grows monotonically with rows)
  let lo = 0.05, hi = 6;
  for (let it = 0; it < 24; it++) {
    const k = (lo + hi) / 2;
    if (capacityOf(withRows(rowsAt(k))) < target) lo = k; else hi = k;
  }
  let best = rowsAt(hi), bestCap = capacityOf(withRows(best));
  // fine tune one row at a time on each tier
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < best.length; i++) {
      for (const dr of [-1, 1]) {
        const cand = best.slice();
        cand[i] = Math.min(ROWS_MAX, Math.max(ROWS_MIN, cand[i] + dr));
        const c = capacityOf(withRows(cand));
        if (Math.abs(c - target) < Math.abs(bestCap - target)) { best = cand; bestCap = c; }
      }
    }
  }
  return { rows: best, capacity: bestCap, reached: Math.abs(bestCap - target) <= Math.max(500, target * 0.01) };
}

/** Marginal effect of one more / one fewer row on each tier — shown as suggestions. */
export function rowSensitivity(p: Project): { tier: string; perRow: number }[] {
  const now = capacityOf(p);
  return p.tiers.map((t, i) => {
    const q = { ...p, tiers: p.tiers.map((x, j) => (j === i ? { ...x, rows: x.rows + 1 } : x)) };
    return { tier: t.name, perRow: capacityOf(q) - now };
  });
}
