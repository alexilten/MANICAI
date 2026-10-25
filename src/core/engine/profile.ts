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
 * The solver takes the worst of three sections: sideline, end, and the corner bisector to the field
 * corner — a generous corner radius pulls the corner rows closer to the field corner than either stand.
 */
import type { Project, TierParams } from '../schema';
import type { Mm } from '../units';
import type { PlanRing } from './plan';

/** eye point: this far in front of the riser behind the seat (see standards: manicai.eye) */
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
  /** the riser was capped by the maximum rake, so the target C could not be met */
  capped: boolean;
}

export interface TierProfile {
  id: string;
  index: number;
  name: string;
  rowDepth: Mm;
  rows: RowProfile[];
  /** nosing of the first row / back of the last tread */
  front: Mm; back: Mm;
  /** first tread / last tread levels */
  bottom: Mm; top: Mm;
  barrier: Mm;
  /** average rake front→back, and steepest single riser, degrees */
  rakeDeg: number; maxRakeDeg: number;
  minC: Mm;
  /** closed section outline, counter-clockwise in (d, z) — terrace treads, risers, back, soffit, front */
  outline: [number, number][];
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

export function solveProfiles(project: Project, ring: PlanRing): TierProfile[] {
  const s = project.sightlines;
  const eye = project.seating.eyeHeight;
  const out: TierProfile[] = [];
  // the focus is the field boundary; stands are measured perpendicular to it
  const Dside = ring.sideDistance, Dend = ring.endDistance, Dcorner = ring.cornerDistance;
  const tanMax = Math.tan((s.maxRakeDeg * Math.PI) / 180);

  let prev: TierProfile | null = null;
  project.tiers.forEach((t: TierParams, ti) => {
    const T = t.rowDepth;
    const front = prev ? prev.back - t.overhang : 0;
    const bottom = prev ? prev.top + t.elevation : t.elevation;
    const rows: RowProfile[] = [];
    const maxRiser = Math.max(s.riserStep, Math.floor((T * tanMax) / s.riserStep) * s.riserStep);
    for (let i = 0; i < Math.max(1, Math.round(t.rows)); i++) {
      const d = front + i * T;
      const eyeD = d + T - EYE_FROM_BACK;
      let z: number, riser = 0, capped = false;
      if (i === 0) z = bottom;
      else {
        const p = rows[i - 1];
        if (s.mode === 'riser') {
          riser = t.riser;
        } else {
          const C = t.targetC ?? s.targetC;
          const need = Math.max(...[Dside, Dend, Dcorner].map((D0) => riserFor(C, D0 + p.eyeD, p.eyeZ, T)));
          riser = Math.max(s.riserStep, rnd(need, s.riserStep));
          if (riser > maxRiser) { riser = maxRiser; capped = true; }
        }
        z = p.z + riser;
      }
      const eyeZ = z + eye;
      let cSide: number, cEnd: number, cCorner: number;
      if (i === 0) {
        // first row looks over the tier's front barrier, standing at the nosing line
        const bz = z + t.barrier;
        const over = (D: number) => (eyeZ * (D + d)) / (D + eyeD) - bz;
        cSide = over(Dside); cEnd = over(Dend); cCorner = over(Dcorner);
      } else {
        const p = rows[i - 1];
        cSide = cValue(Dside + p.eyeD, p.eyeZ, riser, T);
        cEnd = cValue(Dend + p.eyeD, p.eyeZ, riser, T);
        cCorner = cValue(Dcorner + p.eyeD, p.eyeZ, riser, T);
      }
      rows.push({ d, z, riser, eyeD, eyeZ, cSide, cEnd, cCorner, capped });
    }
    const last = rows[rows.length - 1];
    const back = last.d + T;
    const top = last.z;
    let maxR = 0;
    for (const r of rows) maxR = Math.max(maxR, Math.atan2(r.riser, T));
    const rake = rows.length > 1 ? Math.atan2(top - bottom, (rows.length - 1) * T) : 0;
    const prof: TierProfile = {
      id: t.id, index: ti, name: t.name, rowDepth: T, rows, front, back, bottom, top, barrier: t.barrier,
      rakeDeg: (rake * 180) / Math.PI, maxRakeDeg: (maxR * 180) / Math.PI,
      minC: Math.min(...rows.map((r) => Math.min(r.cSide, r.cEnd, r.cCorner))),
      outline: outlineFor(rows, T, front, back, bottom, top, ti === 0),
    };
    if (prev) prof.headroomBelow = bottom - FASCIA_DEPTH - prev.top;
    out.push(prof);
    prev = prof;
  });
  return out;
}

function outlineFor(rows: RowProfile[], T: number, front: number, back: number, bottom: number, top: number, onGrade: boolean): [number, number][] {
  const steps: [number, number][] = [];
  for (const r of rows) { steps.push([r.d, r.z]); steps.push([r.d + T, r.z]); }
  const pts: [number, number][] = [];
  if (onGrade) {
    // lower tier: front wall from the field, terraces, back wall, then a raked soffit down to grade
    const slope = rows.length > 1 ? (top - bottom) / (back - front) : 0;
    const soffitBack = Math.max(0, top - SOFFIT_DEPTH);
    const dGround = slope > 1e-6 ? back - soffitBack / slope : front;
    pts.push([front, 0], ...steps, [back, soffitBack]);
    if (soffitBack > 0 && dGround > front + 1) pts.push([dGround, 0]);
  } else {
    // upper tiers: fascia, terraces, back, soffit parallel to the rake
    pts.push([front, bottom - FASCIA_DEPTH], ...steps, [back, top - SOFFIT_DEPTH]);
  }
  // counter-clockwise in (d, z): the list above runs clockwise (front → up the steps → back → down)
  return dedupe(pts).reverse();
}

function dedupe(p: [number, number][]) {
  return p.filter((q, i) => i === 0 || Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) > 0.01);
}
