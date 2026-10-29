/**
 * Seating tier sections: row-by-row stepped profiles and the sightline (C-value) solver.
 *
 * A profile lives in the bowl's section plane: d = plan offset behind the front-row line,
 * z = elevation above the field. Rows are continuous rings, so a row has one elevation all
 * the way round the bowl; the riser solver therefore takes the most demanding stand.
 *
 * C-value (SGSA Green Guide; John & Sheard, "Stadia"):
 *     C = D (N + R) / (D + T) − R
 *   D  horizontal distance from the eye in the row in front to the point of focus
 *   R  height of that eye above the point of focus
 *   N  riser between the two rows,  T  row depth (tread)
 * Solving for the riser that achieves a target C:
 *     N = (C + R)(D + T) / D − R
 * Focus: the nearest field boundary line at field level (touchline/goal line; sideline/end line).
 * The solver takes the worst section among the regions that carry the tier: each stand at its own
 * first-row distance, and each corner on its bisector to the field corner (a generous corner radius
 * pulls the corner rows closer to the field corner than either stand).
 *
 * Cross-aisles (Round 02) widen the tread of the row in front of them; the row behind is solved with
 * the real horizontal spacing between the two eyes, so the riser grows to keep the target C.
 */
import type { Project, TierParams } from '../schema';
import type { Mm } from '../units';
import { CORNERS, STANDS, type PlanRing } from './plan';
import type { RegionRows } from './layout';

/** eye point: this far in front of the riser behind the seat (see standards: manica.eye) */
export const EYE_FROM_BACK = 400;
/** seat reference point (pan centre): this far in front of the riser behind */
export const SEAT_FROM_BACK = 300;
/** visual / envelope assumptions for the tier outline (architectural, not structural) */
export const FASCIA_DEPTH = 1500;
export const SOFFIT_DEPTH = 1200;
/** FIFA: 2.4 m head clearance where possible */
export const HEADROOM = 2400;

export interface RowProfile {
  /** plan offset of the row's nosing (front of its tread) */
  d: Mm;
  /** tread level */
  z: Mm;
  /** riser from the row in front (0 for a tier's first row) */
  riser: Mm;
  /** eye point */
  eyeD: Mm; eyeZ: Mm;
  /** C-value on the sideline and end stands and on the corner bisector, in section (first row: over the tier's front barrier) */
  cSide: Mm; cEnd: Mm; cCorner: Mm;
  /** C-value at the nearest section among the regions that carry this tier (the governing one) */
  cGov: Mm;
  /** the riser was capped by the maximum rake, so the target C could not be met */
  capped: boolean;
}

export interface TierProfile {
  id: string;
  index: number;
  name: string;
  rowDepth: Mm;
  /** every solved row (regions that extend the tier use rows past `base`) */
  rows: RowProfile[];
  /** the tier's own row count: the tier above is set out from the back of this row */
  base: number;
  /** nosing of the first row / back of the base rows */
  front: Mm; back: Mm;
  /** first tread / last tread levels */
  bottom: Mm; top: Mm;
  barrier: Mm;
  /** average rake front→back, and steepest single riser, degrees */
  rakeDeg: number; maxRakeDeg: number;
  minC: Mm;
  /** closed section outline of the base rows, counter-clockwise in (d, z) — terrace treads, risers, back, soffit, front */
  outline: [number, number][];
  /** the first tier sits on grade (front wall and raked soffit down to the field) */
  onGrade: boolean;
  /** rows that have a cross-aisle behind them (0-based) */
  aisleAfter: number[];
  /** vertical clearance under the front of this tier above the last tread of the tier below (upper tiers) */
  headroomBelow?: Mm;
}

const rnd = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

/** C-value for an eye behind another eye/obstruction, both relative to the focus point. */
export function cValue(D: number, R: number, Nrise: number, T: number) {
  return (D * (Nrise + R)) / (D + T) - R;
}
/** Riser needed for a target C. */
export function riserFor(C: number, D: number, R: number, T: number) {
  return ((C + R) * (D + T)) / D - R;
}

export function solveProfiles(project: Project, ring: PlanRing, regions: RegionRows): TierProfile[] {
  const s = project.sightlines;
  const eye = project.seating.eyeHeight;
  const caW = project.seating.crossAisleWidth ?? 0;
  const out: TierProfile[] = [];
  const tanMax = Math.tan((s.maxRakeDeg * Math.PI) / 180);

  let prev: TierProfile | null = null;
  project.tiers.forEach((t: TierParams, ti) => {
    const T = t.rowDepth;
    const base = Math.max(1, Math.round(t.rows));
    const nSolve = Math.max(base, ...Object.values(regions).map((r) => r[ti] ?? 0));
    // the sections this tier must satisfy: every region that carries it
    const Ds = [...STANDS.filter((g) => regions[g][ti] > 0).map((g) => ring.dist[g]), ...CORNERS.filter((g) => regions[g][ti] > 0).map((g) => ring.cornerDist[g])];
    if (!Ds.length) Ds.push(...STANDS.map((g) => ring.dist[g]), ...CORNERS.map((g) => ring.cornerDist[g]));
    const Dmin = Math.min(...Ds);
    const aisleAfter = [...new Set((t.crossAisles ?? []).map((k) => Math.round(k) - 1).filter((k) => k >= 0 && k < nSolve - 1))].sort((a, b) => a - b);
    const under = (project.premium ?? []).filter((l) => l.belowTier === t.id && ti > 0);
    const front = prev ? prev.back - t.overhang + under.reduce((a, l) => a + (l.setback ?? 0), 0) : 0;
    // premium levels inserted under this tier lift it by their floor-to-floor heights
    const lift = under.reduce((a, l) => a + l.height, 0);
    const bottom = prev ? prev.top + t.elevation + lift : t.elevation;
    const rows: RowProfile[] = [];
    const maxRiser = Math.max(s.riserStep, Math.floor((T * tanMax) / s.riserStep) * s.riserStep);
    let extra = 0;
    for (let i = 0; i < nSolve; i++) {
      if (aisleAfter.includes(i - 1)) extra += caW;
      const d = front + i * T + extra;
      const eyeD = d + T - EYE_FROM_BACK;
      let z: number, riser = 0, capped = false;
      const p = rows[i - 1];
      if (i === 0) z = bottom;
      else {
        if (s.mode === 'riser') {
          riser = t.riser;
        } else {
          const C = t.targetC ?? s.targetC;
          // the nearest section governs (C grows with distance for a given riser)
          const need = riserFor(C, Dmin + p.eyeD, p.eyeZ, eyeD - p.eyeD);
          riser = Math.max(s.riserStep, rnd(need, s.riserStep));
          if (riser > maxRiser) { riser = maxRiser; capped = true; }
        }
        z = p.z + riser;
      }
      const eyeZ = z + eye;
      const cAt = (D0: number) => (i === 0
        // first row looks over the tier's front barrier, standing at the nosing line
        ? (eyeZ * (D0 + d)) / (D0 + eyeD) - (z + t.barrier)
        : cValue(D0 + p.eyeD, p.eyeZ, riser, eyeD - p.eyeD));
      const cornerD = Math.min(...CORNERS.map((g) => ring.cornerDist[g]));
      rows.push({ d, z, riser, eyeD, eyeZ, cSide: cAt(Math.min(ring.dist.N, ring.dist.S)), cEnd: cAt(Math.min(ring.dist.E, ring.dist.W)), cCorner: cAt(cornerD), cGov: cAt(Dmin), capped });
    }
    const last = rows[base - 1];
    const back = last.d + T;
    const top = last.z;
    let maxR = 0;
    for (const r of rows.slice(0, base)) maxR = Math.max(maxR, Math.atan2(r.riser, T));
    const rake = base > 1 ? Math.atan2(top - bottom, back - T - front) : 0;
    const prof: TierProfile = {
      id: t.id, index: ti, name: t.name, rowDepth: T, rows, base, front, back, bottom, top, barrier: t.barrier,
      rakeDeg: (rake * 180) / Math.PI, maxRakeDeg: (maxR * 180) / Math.PI,
      minC: Math.min(...rows.map((r) => r.cGov)),
      outline: [], onGrade: ti === 0, aisleAfter,
    };
    prof.outline = tierOutline(prof, base);
    if (prev) prof.headroomBelow = bottom - FASCIA_DEPTH - prev.top;
    out.push(prof);
    prev = prof;
  });
  return out;
}

/** Closed section outline of the first `n` rows, counter-clockwise in (d, z). */
export function tierOutline(prof: TierProfile, n: number): [number, number][] {
  const rows = prof.rows.slice(0, Math.max(1, Math.min(n, prof.rows.length)));
  const T = prof.rowDepth;
  const front = prof.front, bottom = prof.bottom;
  const last = rows[rows.length - 1];
  const back = last.d + T, top = last.z;
  const steps: [number, number][] = [];
  rows.forEach((r, i) => { steps.push([r.d, r.z]); steps.push([i < rows.length - 1 ? rows[i + 1].d : r.d + T, r.z]); });
  const pts: [number, number][] = [];
  // a straight soffit is the chord of the rake; under a strongly curved (constant-C) rake it would cut
  // up through the middle treads, so there the soffit follows the nosings at the soffit depth instead
  const cuts = (a: [number, number], b: [number, number]) => rows.some((r, i) => {
    const d1 = i < rows.length - 1 ? rows[i + 1].d : r.d + T;
    return [r.d, d1].some((d) => d > Math.min(a[0], b[0]) && d < Math.max(a[0], b[0]) && a[1] + ((b[1] - a[1]) * (d - a[0])) / (b[0] - a[0]) > r.z - 100);
  });
  const following = (stopAtGrade: boolean): [number, number][] => {
    const out: [number, number][] = [];
    let prev: [number, number] = [back, top - SOFFIT_DEPTH];
    for (let i = rows.length - 1; i >= (stopAtGrade ? 0 : 1); i--) {
      const q: [number, number] = [rows[i].d, rows[i].z - SOFFIT_DEPTH];
      if (stopAtGrade && q[1] <= 0) { out.push([prev[0] + ((q[0] - prev[0]) * prev[1]) / (prev[1] - q[1]), 0]); return out; }
      out.push(q); prev = q;
    }
    return out;
  };
  if (prof.onGrade) {
    // lower tier: front wall from the field, terraces, back wall, then a raked soffit down to grade
    const slope = rows.length > 1 ? (top - bottom) / (back - front) : 0;
    const soffitBack = Math.max(0, top - SOFFIT_DEPTH);
    const dGround = slope > 1e-6 ? back - soffitBack / slope : front;
    pts.push([front, 0], ...steps, [back, soffitBack]);
    const toGround = soffitBack > 0 && dGround > front + 1;
    if (soffitBack > 0 && cuts([back, soffitBack], toGround ? [dGround, 0] : [front, 0])) pts.push(...following(true));
    else if (toGround) pts.push([dGround, 0]);
  } else {
    // upper tiers: fascia, terraces, back, soffit parallel to the rake
    pts.push([front, bottom - FASCIA_DEPTH], ...steps, [back, top - SOFFIT_DEPTH]);
    if (cuts([back, top - SOFFIT_DEPTH], [front, bottom - FASCIA_DEPTH])) pts.push(...following(false));
  }
  // counter-clockwise in (d, z): the list above runs clockwise (front → up the steps → back → down)
  return dedupe(pts).reverse();
}

function dedupe(p: [number, number][]) {
  const out = p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 0.01);
  // the outline is closed: a last point on the first is the same corner
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
  return out;
}
