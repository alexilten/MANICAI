/**
 * Multivariable design exploration (Round 07): capacity against proximity.
 *
 * Variables: the sideline and end first-row distances (moved together, keeping any per-stand
 * differences), the corner radius and each tier's row count. Each candidate design is regenerated for
 * real (plan, sightline solver, every seat), then rated on:
 *   capacity            net bowl seats plus suite seats (maximise)
 *   mean distance       eye to the centre spot, over the seats in use (minimise)
 *   view quality        the Round 07 seat score, for information
 * and checked against the design's own rules: the minimum C-value (unless poor seats are excluded),
 * tier headroom, and the run-off (the distances never go inside it).
 *
 * Search: the current design, a Latin hypercube of starting points, then generations of mutations of
 * the non-dominated designs. The result keeps every candidate, marks the Pareto front (no other feasible
 * design has more seats and a shorter mean distance), and recommends the closest-in design that reaches
 * the target capacity. Seeded, so the same design gives the same alternatives. A search, not a proof of
 * optimality: other variables (tiers, rakes, premium levels, roof) are held as they are.
 */
import type { Project, StandId } from '../core/schema';
import { SPORTS } from '../core/sports';
import { regionRows, standDistances } from '../core/engine/layout';
import { makeRing } from '../core/engine/plan';
import { HEADROOM, solveProfiles } from '../core/engine/profile';
import { generateSeats } from '../core/engine/seats';
import { suiteSeats } from '../core/engine/building';
import { ROWS_MAX, ROWS_MIN } from '../core/engine/optimize';
import { headTurn, qualityOf } from './quality';

export interface Score {
  /** net seats per tier */
  tierSeats: number[];
  capacity: number; meanCentre: number; within150: number; quality: number; minC: number;
  feasible: boolean; breaks: string[];
}

/** Regenerate a design's bowl and rate it (no building, roof or systems: they never move a seat). */
export function scoreDesign(p: Project): Score {
  const f = SPORTS[p.sport].build(p.field);
  const layout = regionRows(p);
  const ring = makeRing(f.length, f.width, standDistances(p), 0, p.bowl.cornerRadius);
  const profiles = solveProfiles(p, ring, layout.rows);
  const res = generateSeats(p, ring, profiles, layout.rows, { focus: f.boundary, fieldLW: [f.length, f.width] });
  const t = res.seats;
  const targets = p.tiers.map((x) => x.targetC ?? p.sightlines.targetC);
  let n = 0, d = 0, w = 0, q = 0;
  const tierSeats = p.tiers.map(() => 0);
  for (let i = 0; i < t.count; i++) {
    if (t.status[i] !== 0) continue;
    n++; d += t.distCentre[i]; tierSeats[t.tier[i]]++;
    if (t.distFar[i] <= 150000) w++;
    q += qualityOf(t.distFar[i], t.cValue[i], targets[t.tier[i]], headTurn(t.x[i], t.y[i], t.rot[i])).quality;
  }
  const minC = Math.min(...profiles.map((x) => x.minC));
  const breaks: string[] = [];
  if (!p.sightlines.excludeBelowMin && minC < p.sightlines.minC - 0.5) breaks.push(`C-value ${Math.round(minC)} mm below the ${p.sightlines.minC} mm minimum`);
  if (profiles.some((x) => x.headroomBelow !== undefined && x.headroomBelow < HEADROOM)) breaks.push('tier headroom below 2.4 m');
  if (layout.clamped.length) breaks.push('rows clamped under a tier above');
  return { tierSeats, capacity: res.counts.net + suiteSeats(p, ring, profiles), meanCentre: n ? d / n : 0, within150: n ? w / n : 0, quality: n ? q / n : 0, minC, feasible: !breaks.length, breaks };
}

export interface Vars { side: number; end: number; corner: number; rows: number[] }
export interface Candidate extends Score {
  id: number;
  vars: Vars;
  project: Project;
  pareto: boolean;
  /** what differs from the starting design, in words */
  changes: string[];
}
export interface ExploreResult {
  candidates: Candidate[];
  /** indices of the Pareto front, by capacity */
  front: number[];
  /** the closest-in feasible design that reaches the target (or the largest feasible one) */
  recommended: number;
  /** a few spread-out alternatives from the front, labelled A, B, C … */
  alternatives: number[];
  evaluations: number;
}

/** mulberry32: a small seeded generator, so a design always gives the same alternatives */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function bounds(p: Project) {
  const ds = standDistances(p);
  const sideMin = Math.min(ds.N - p.field.runoffSide, ds.S - p.field.runoffSide), endMin = Math.min(ds.E - p.field.runoffEnd, ds.W - p.field.runoffEnd);
  return {
    side: [-Math.max(0, sideMin), 15000] as [number, number],
    end: [-Math.max(0, endMin), 20000] as [number, number],
    corner: [0, 40000] as [number, number],
    rows: p.tiers.map((t) => [Math.max(ROWS_MIN, Math.round(t.rows * 0.6)), Math.min(ROWS_MAX, Math.round(t.rows * 1.4))] as [number, number]),
  };
}

const STANDS: StandId[] = ['N', 'S', 'E', 'W'];

/** The starting design with the variables applied (side/end are changes to every stand's distance). */
export function applyVars(p: Project, v: Vars): Project {
  const q: Project = structuredClone(p);
  const ds = standDistances(p);
  for (const g of STANDS) {
    const dd = g === 'N' || g === 'S' ? v.side : v.end;
    if (q.bowl.stands[g]?.distance !== undefined) q.bowl.stands[g] = { ...q.bowl.stands[g], distance: ds[g] + dd };
  }
  q.bowl.sideDistance = p.bowl.sideDistance + v.side;
  q.bowl.endDistance = p.bowl.endDistance + v.end;
  q.bowl.cornerRadius = v.corner;
  q.tiers.forEach((t, i) => { t.rows = v.rows[i]; });
  q.presetId = undefined;
  return q;
}

function describe(p: Project, v: Vars): string[] {
  const out: string[] = [];
  const m = (x: number) => `${x > 0 ? '+' : '−'}${(Math.abs(x) / 1000).toFixed(1)} m`;
  if (Math.abs(v.side) >= 100) out.push(`sidelines ${m(v.side)}`);
  if (Math.abs(v.end) >= 100) out.push(`ends ${m(v.end)}`);
  if (Math.abs(v.corner - p.bowl.cornerRadius) >= 100) out.push(`corner radius ${(v.corner / 1000).toFixed(1)} m`);
  p.tiers.forEach((t, i) => { if (v.rows[i] !== t.rows) out.push(`${t.name} ${v.rows[i]} rows (${v.rows[i] > t.rows ? '+' : '−'}${Math.abs(v.rows[i] - t.rows)})`); });
  return out.length ? out : ['the current design'];
}

const dominates = (a: Score, b: Score) => a.capacity >= b.capacity && a.meanCentre <= b.meanCentre && (a.capacity > b.capacity || a.meanCentre < b.meanCentre);

export function paretoFront(cs: Score[]): number[] {
  const idx = cs.map((_, i) => i).filter((i) => cs[i].feasible);
  return idx.filter((i) => !idx.some((j) => j !== i && dominates(cs[j], cs[i]))).sort((a, b) => cs[a].capacity - cs[b].capacity);
}

export interface ExploreOptions { initial?: number; generations?: number; perGeneration?: number; targetGenerations?: number; seed?: number; onProgress?: (done: number, total: number) => void }

export function explore(p: Project, opts: ExploreOptions = {}): ExploreResult {
  const N0 = opts.initial ?? 24, G = opts.generations ?? 2, NG = opts.perGeneration ?? 16, GT = opts.targetGenerations ?? 2, NT = 8;
  const total = N0 + G * NG + GT * NT * 2;
  const rand = rng(opts.seed ?? 7);
  const B = bounds(p);
  const cands: Candidate[] = [];
  const seen = new Set<string>();
  const add = (v: Vars) => {
    const key = JSON.stringify([Math.round(v.side / 100), Math.round(v.end / 100), Math.round(v.corner / 100), v.rows]);
    if (seen.has(key)) return null;
    seen.add(key);
    const q = applyVars(p, v);
    const c: Candidate = { id: cands.length, vars: v, project: q, pareto: false, changes: describe(p, v), ...scoreDesign(q) };
    cands.push(c);
    opts.onProgress?.(cands.length, total);
    return c;
  };
  const lerp = (r: [number, number], k: number) => r[0] + (r[1] - r[0]) * k;
  const clampV = (v: Vars): Vars => ({
    side: Math.round(Math.min(B.side[1], Math.max(B.side[0], v.side)) / 100) * 100,
    end: Math.round(Math.min(B.end[1], Math.max(B.end[0], v.end)) / 100) * 100,
    corner: Math.round(Math.min(B.corner[1], Math.max(B.corner[0], v.corner)) / 500) * 500,
    rows: v.rows.map((r, i) => Math.round(Math.min(B.rows[i][1], Math.max(B.rows[i][0], r)))),
  });
  // the current design, then a Latin hypercube
  add({ side: 0, end: 0, corner: p.bowl.cornerRadius, rows: p.tiers.map((t) => t.rows) });
  const dims = 3 + p.tiers.length;
  const strata = Array.from({ length: dims }, () => { const a = Array.from({ length: N0 - 1 }, (_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });
  for (let k = 0; k < N0 - 1; k++) {
    const u = (dim: number) => (strata[dim][k] + rand()) / (N0 - 1);
    add(clampV({ side: lerp(B.side, u(0)), end: lerp(B.end, u(1)), corner: lerp(B.corner, u(2)), rows: B.rows.map((r, i) => lerp(r, u(3 + i))) }));
  }
  // generations: mutate the non-dominated designs
  for (let g = 0; g < G; g++) {
    const front = paretoFront(cands);
    const parents = front.length ? front : cands.map((_, i) => i);
    for (let k = 0; k < NG; k++) {
      const par = cands[parents[Math.floor(rand() * parents.length)]].vars;
      const span = 0.15 / (g + 1);
      const jit = (r: [number, number]) => (rand() * 2 - 1) * span * (r[1] - r[0]);
      add(clampV({ side: par.side + jit(B.side), end: par.end + jit(B.end), corner: par.corner + jit(B.corner), rows: par.rows.map((r, i) => r + jit(B.rows[i])) }));
    }
  }
  // target generations: move the plan of the closest-in designs near the target, then re-fit the rows
  // of the lowest tier that can take them back to the target (seats per row measured on the design)
  const target = p.bowl.targetCapacity;
  for (let g = 0; g < GT; g++) {
    const ok = cands.filter((c) => c.feasible);
    const near = ok.filter((c) => Math.abs(c.capacity - target) <= target * 0.03).sort((a, b) => a.meanCentre - b.meanCentre);
    const parents = (near.length ? near : ok.sort((a, b) => Math.abs(a.capacity - target) - Math.abs(b.capacity - target))).slice(0, 4);
    if (!parents.length) break;
    for (let k = 0; k < NT; k++) {
      const par = parents[k % parents.length].vars;
      const span = 0.12 / (g + 1);
      const jit = (r: [number, number]) => (rand() * 2 - 1) * span * (r[1] - r[0]);
      const child = add(clampV({ side: par.side + jit(B.side), end: par.end + jit(B.end), corner: par.corner + jit(B.corner), rows: par.rows.slice() }));
      if (!child) continue;
      const gap = target - child.capacity;
      if (Math.abs(gap) <= target * 0.01) continue;
      const rows = child.vars.rows.slice();
      for (let i = 0; i < rows.length; i++) {
        const perRow = child.tierSeats[i] / Math.max(1, rows[i]);
        if (perRow <= 0) continue;
        const want = Math.round(rows[i] + gap / perRow), got = Math.min(B.rows[i][1], Math.max(B.rows[i][0], want));
        if (got === rows[i]) continue;
        rows[i] = got;
        add({ ...child.vars, rows });
        break;
      }
    }
  }
  const front = paretoFront(cands);
  for (const i of front) cands[i].pareto = true;
  const feasible = cands.filter((c) => c.feasible);
  const reach = feasible.filter((c) => c.capacity >= target * 0.98);
  const rec = reach.length ? reach.reduce((a, b) => (b.meanCentre < a.meanCentre ? b : a)) : feasible.length ? feasible.reduce((a, b) => (b.capacity > a.capacity ? b : a)) : cands[0];
  // alternatives: up to five front designs spread across the capacity range
  const alts: number[] = [];
  if (front.length) {
    const k = Math.min(5, front.length);
    for (let j = 0; j < k; j++) { const i = front[Math.round((j * (front.length - 1)) / Math.max(1, k - 1))]; if (!alts.includes(i)) alts.push(i); }
  }
  return { candidates: cands, front, recommended: rec.id, alternatives: alts, evaluations: cands.length };
}

/** Every candidate as CSV (the chart's data). */
export function exploreCsv(r: ExploreResult): string {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = 'option,capacity,mean_distance_m,within_150m,view_quality,min_c_mm,feasible,pareto,recommended,changes,breaks';
  const rows = r.candidates.map((c) => [c.id, c.capacity, (c.meanCentre / 1000).toFixed(2), c.within150.toFixed(4), c.quality.toFixed(4), Math.round(c.minC), c.feasible, c.pareto, c.id === r.recommended, c.changes.join('; '), c.breaks.join('; ')].map((v) => cell(String(v))).join(','));
  return ['# MANICAI capacity–proximity exploration — seeded search; see docs/STUDIES.md', head, ...rows].join('\n') + '\n';
}
