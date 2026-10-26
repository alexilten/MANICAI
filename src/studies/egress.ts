/**
 * Circulation: egress from the seating (Round 07).
 *
 * Every seat in use walks to the exit of its tier with the shortest route:
 *   • a tier with vomitories leaves by them: along its row to the vomitory's centre line (less half
 *     its width), then up or down the stepped aisle to the mouth row;
 *   • a tier without vomitories leaves at the back: along its row to the nearest radial aisle, then up
 *     the aisle to the back row, where the concourse is (Round 03).
 * The aisle leg is measured on the slope (plan run and rise). Each exit then has the seats that chose it;
 * the time to clear them is  seats / (exit width × rate of passage), with the stepped rate of passage
 * (Green Guide, recall: 79 persons per metre per minute on stepped routes). A tier's egress time is
 * its slowest exit.
 *
 * This is the seating-area stage only (Green Guide "egress time"), not an evacuation model: concourse,
 * stair and gate capacities, travel to a place of safety, fire engineering, queuing, counter-flows and
 * people with reduced mobility are not modelled (standards: greenguide.egress, review.egress).
 */
import type { Stadium } from '../core/engine/stadium';
import { perimeter, pointAt } from '../core/engine/plan';
import { alongPath, arcAt, locateXY } from './geometry';

export interface ExitLoad {
  id: string; tier: number; kind: 'vomitory' | 'aisle';
  /** clear width, mm */
  width: number;
  seats: number;
  /** minutes to clear its seats at the rate of passage */
  minutes: number;
  /** longest route to it, mm */
  maxTravel: number;
  x: number; y: number;
}

export interface EgressResult {
  /** per seat route length, mm (NaN for excluded positions) */
  travel: Float32Array;
  exits: ExitLoad[];
  byTier: { id: string; name: string; seats: number; exits: number; width: number; minutes: number; maxTravel: number; meanTravel: number; kind: 'vomitories' | 'back of tier' }[];
  /** the slowest exit in the bowl, minutes */
  minutes: number;
  maxTravel: number; meanTravel: number;
  /** share of seats in use within the travel-distance limit */
  withinTravel: number;
  ok: boolean;
}

const memo = new WeakMap<Stadium, EgressResult>();

export function egress(s: Stadium): EgressResult {
  const hit = memo.get(s);
  if (hit) return hit;
  const p = s.project, E = p.studies.egress, ring = s.ring, t = s.seats.seats;
  const travel = new Float32Array(t.count).fill(NaN);
  const exits: ExitLoad[] = [];
  const exitsOf: { ex: ExitLoad; seg: Parameters<typeof arcAt>[1]; u: number; d: number; z: number; half: number }[][] = s.profiles.map(() => []);
  s.profiles.forEach((pr, ti) => {
    const voms = s.seats.vomitories.filter((v) => v.tier === ti);
    if (voms.length) {
      for (const v of voms) {
        const at = pointAt(ring, v.seg, v.u, v.dFront);
        const ex: ExitLoad = { id: v.id, tier: ti, kind: 'vomitory', width: v.width, seats: 0, minutes: 0, maxTravel: 0, x: at.x, y: at.y };
        exits.push(ex);
        exitsOf[ti].push({ ex, seg: v.seg, u: v.u, d: v.dFront, z: v.zMouth, half: v.width / 2 });
      }
    } else {
      const back = pr.rows[pr.base - 1];
      const dBack = back.d + pr.rowDepth;
      s.seats.aisles.filter((a) => a.tier === ti).forEach((a, k) => {
        const at = pointAt(ring, a.seg, a.u, dBack);
        const ex: ExitLoad = { id: `${pr.id}.A${k + 1}`, tier: ti, kind: 'aisle', width: p.seating.aisleWidth, seats: 0, minutes: 0, maxTravel: 0, x: at.x, y: at.y };
        exits.push(ex);
        exitsOf[ti].push({ ex, seg: a.seg, u: a.u, d: dBack, z: back.z, half: 0 });
      });
    }
  });
  const tierN = s.profiles.map(() => 0), tierSum = s.profiles.map(() => 0), tierMax = s.profiles.map(() => 0);
  let n = 0, sum = 0, within = 0, maxTravel = 0;
  // exits' arc positions per tier and row offset (seats in one row share them)
  const arcs = new Map<string, Float64Array>();
  const arcsAt = (ti: number, d: number) => {
    const key = `${ti}:${Math.round(d)}`;
    let a = arcs.get(key);
    if (!a) { a = Float64Array.from(exitsOf[ti], (c) => arcAt(ring, c.seg, c.u, d)); arcs.set(key, a); }
    return a;
  };
  for (let i = 0; i < t.count; i++) {
    if (t.status[i] !== 0) continue;
    const ti = t.tier[i], cands = exitsOf[ti];
    if (!cands.length) continue;
    const loc = locateXY(ring, t.x[i], t.y[i]);
    const sSeat = arcAt(ring, loc.seg, loc.u, loc.d);
    let best = Infinity, bestEx: ExitLoad | null = null;
    const at = arcsAt(ti, loc.d), P = perimeter(ring, loc.d);
    for (let k = 0; k < cands.length; k++) {
      const c = cands[k];
      const lateral = Math.max(0, alongPath(P, sSeat, at[k]) - c.half);
      const route = lateral + Math.hypot(loc.d - c.d, t.z[i] - c.z);
      if (route < best) { best = route; bestEx = c.ex; }
    }
    if (!bestEx) continue;
    travel[i] = best;
    bestEx.seats++;
    bestEx.maxTravel = Math.max(bestEx.maxTravel, best);
    n++; sum += best; maxTravel = Math.max(maxTravel, best);
    if (best <= E.maxTravel) within++;
    tierN[ti]++; tierSum[ti] += best; tierMax[ti] = Math.max(tierMax[ti], best);
  }
  for (const ex of exits) ex.minutes = ex.seats / ((ex.width / 1000) * E.stepRate);
  const byTier = s.profiles.map((pr, ti) => {
    const xs = exits.filter((e) => e.tier === ti);
    return {
      id: pr.id, name: pr.name, seats: tierN[ti], exits: xs.length, width: xs.reduce((a, e) => a + e.width, 0),
      minutes: Math.max(0, ...xs.map((e) => e.minutes)), maxTravel: tierMax[ti], meanTravel: tierN[ti] ? tierSum[ti] / tierN[ti] : 0,
      kind: (xs[0]?.kind === 'vomitory' ? 'vomitories' : 'back of tier') as 'vomitories' | 'back of tier',
    };
  });
  const minutes = Math.max(0, ...exits.map((e) => e.minutes));
  const r: EgressResult = {
    travel, exits, byTier, minutes, maxTravel, meanTravel: n ? sum / n : 0, withinTravel: n ? within / n : 1,
    ok: minutes <= E.targetMin && maxTravel <= E.maxTravel,
  };
  memo.set(s, r);
  return r;
}
