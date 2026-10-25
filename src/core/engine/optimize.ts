/**
 * Capacity tools. The target is reached by real geometric moves (rows, distances, corners, ends,
 * seat module, vomitory spacing) that keep the plan, the sightline rules and the seat module, never
 * by scaling seat arrays. Capacity here is net capacity: the seats left after vomitories, wheelchair
 * platforms and other configured exclusions.
 */
import type { Project, StandId } from '../schema';
import { SPORTS } from '../sports';
import { regionRows, standDistances } from './layout';
import { makeRing } from './plan';
import { HEADROOM, solveProfiles } from './profile';
import { countSeats } from './seats';

export const ROWS_MIN = 3;
export const ROWS_MAX = 70;

/** Net capacity, plus what the sightline and planning checks need to rate a design (no seat table is stored). */
export function evaluate(p: Project) {
  const f = SPORTS[p.sport].build(p.field);
  const layout = regionRows(p);
  const ring = makeRing(f.length, f.width, standDistances(p), 0, p.bowl.cornerRadius);
  const profiles = solveProfiles(p, ring, layout.rows);
  const counts = countSeats(p, ring, profiles, layout.rows, { focus: f.boundary, fieldLW: [f.length, f.width] });
  return { counts, profiles, ring, layout };
}

export function capacityOf(p: Project): number {
  return evaluate(p).counts.net;
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

/** Marginal effect of one more row on each tier. */
export function rowSensitivity(p: Project): { tier: string; perRow: number }[] {
  const now = capacityOf(p);
  return p.tiers.map((t, i) => {
    const q = { ...p, tiers: p.tiers.map((x, j) => (j === i ? { ...x, rows: x.rows + 1 } : x)) };
    return { tier: t.name, perRow: capacityOf(q) - now };
  });
}

export interface Move {
  id: string;
  label: string;
  /** net capacity after the move, and the change */
  capacity: number; delta: number;
  /** rule checks the move would break (empty = clean) */
  breaks: string[];
  /** the move, applied to a copy of the project */
  apply: (p: Project) => void;
}

/**
 * Candidate moves toward the target, each evaluated on a copy of the project and checked against
 * the project's own rules (minimum C-value, rake limit, tier headroom, seat and row minimums).
 * Sorted: clean moves that close the gap first.
 */
export function suggestMoves(p: Project, limit = 6): Move[] {
  const now = evaluate(p).counts.net;
  const gap = p.bowl.targetCapacity - now;
  const up = gap > 0;
  const cands: Omit<Move, 'capacity' | 'delta' | 'breaks'>[] = [];
  const step = (v: number) => (up ? v : -v);
  p.tiers.forEach((t, i) => {
    const n = up ? 2 : -2;
    if (t.rows + n >= ROWS_MIN && t.rows + n <= ROWS_MAX) cands.push({ id: `rows.${t.id}`, label: `${up ? 'Add' : 'Remove'} 2 rows on ${t.name}`, apply: (q) => { q.tiers[i].rows += n; } });
    if (t.vomitories.enabled && up) cands.push({ id: `vom.${t.id}`, label: `Vomitories in every ${t.vomitories.every + 1} sections on ${t.name}`, apply: (q) => { q.tiers[i].vomitories.every += 1; } });
    if (t.vomitories.enabled && !up && t.vomitories.every > 1) cands.push({ id: `vom.${t.id}`, label: `Vomitories in every ${t.vomitories.every - 1} sections on ${t.name}`, apply: (q) => { q.tiers[i].vomitories.every -= 1; } });
  });
  const ds = standDistances(p);
  const moveStand = (g: StandId, dd: number, label: string) => cands.push({ id: `dist.${g}`, label, apply: (q) => { q.bowl.stands[g] = { ...q.bowl.stands[g], distance: ds[g] + dd }; } });
  moveStand('N', step(-1000), `${up ? 'Bring' : 'Move'} the north sideline ${up ? 'in' : 'out'} 1 m`);
  moveStand('S', step(-1000), `${up ? 'Bring' : 'Move'} the south sideline ${up ? 'in' : 'out'} 1 m`);
  cands.push({ id: 'dist.ends', label: `${up ? 'Bring' : 'Move'} both ends ${up ? 'in' : 'out'} 1 m`, apply: (q) => { for (const g of ['E', 'W'] as StandId[]) q.bowl.stands[g] = { ...q.bowl.stands[g], distance: ds[g] + step(-1000) }; } });
  cands.push({ id: 'corner', label: up ? 'Tighten the corner radius by 4 m' : 'Open the corner radius by 4 m', apply: (q) => { q.bowl.cornerRadius = Math.max(0, q.bowl.cornerRadius + step(-4000)); } });
  for (const g of ['E', 'W'] as StandId[]) {
    const st = p.bowl.stands[g];
    if (up && st?.open) cands.push({ id: `open.${g}`, label: `Close the ${g === 'E' ? 'east' : 'west'} end`, apply: (q) => { q.bowl.stands[g] = { ...q.bowl.stands[g], open: false }; } });
    if (!up && !st?.open) cands.push({ id: `open.${g}`, label: `Open the ${g === 'E' ? 'east' : 'west'} end`, apply: (q) => { q.bowl.stands[g] = { ...q.bowl.stands[g], open: true }; } });
  }
  cands.push({ id: 'seat.width', label: up ? 'Seat width −20 mm' : 'Seat width +20 mm', apply: (q) => { q.seating.seatWidth += step(-20); } });

  const moves: Move[] = cands.map((c) => {
    const q: Project = structuredClone(p);
    c.apply(q);
    const ev = evaluate(q);
    return { ...c, capacity: ev.counts.net, delta: ev.counts.net - now, breaks: checks(q, ev, p) };
  });
  return moves
    .filter((m) => Math.sign(m.delta) === Math.sign(gap) && m.delta !== 0)
    .sort((a, b) => (a.breaks.length ? 1 : 0) - (b.breaks.length ? 1 : 0) || Math.abs(p.bowl.targetCapacity - a.capacity) - Math.abs(p.bowl.targetCapacity - b.capacity))
    .slice(0, limit);
}

/** Rules a candidate breaks that the current design does not. */
function checks(q: Project, ev: ReturnType<typeof evaluate>, before: Project): string[] {
  const out: string[] = [];
  const minC = Math.min(...ev.profiles.map((t) => t.minC));
  const minC0 = Math.min(...evaluate(before).profiles.map((t) => t.minC));
  if (minC < q.sightlines.minC - 0.5 && minC < minC0 - 0.5) out.push(`C-value drops to ${Math.round(minC)} mm`);
  if (ev.profiles.some((t) => t.headroomBelow !== undefined && t.headroomBelow < HEADROOM)) out.push('tier headroom below 2.4 m');
  if (q.seating.seatWidth < 460) out.push('seat width below 460 mm');
  const ds = standDistances(q);
  if (ds.N < q.field.runoffSide || ds.S < q.field.runoffSide || ds.E < q.field.runoffEnd || ds.W < q.field.runoffEnd) out.push('first row inside the run-off');
  return out;
}
