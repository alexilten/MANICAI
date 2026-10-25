/**
 * Individual seat generation.
 *
 * Seats are real positions, not an area estimate: every row ring is cut into sections by radial
 * aisles, and each section-row holds as many whole seats of the configured width as fit between
 * the aisle edges. Capacity is the count of these positions.
 *
 * Aisles sit at every segment junction (sideline/corner/end) and evenly between them, spaced so no
 * row holds more than `maxSeatsBetweenAisles` seats. Straight aisles are perpendicular to the
 * field; corner aisles are radial (equal angles), so they line up from row to row.
 *
 * Storage is columnar (typed arrays) so 100,000 seats stay cheap; every seat is still individually
 * addressable by index and by a stable id built from tier · section · row · seat number.
 */
import type { Project } from '../schema';
import type { Rect } from '../sports';
import { isCorner, planOffset, pointAt, SECTORS, SECTOR_OF, segmentLength, SEGMENTS, type PlanRing, type SegmentId, type Sector } from './plan';
import { EYE_FROM_BACK, SEAT_FROM_BACK, type TierProfile } from './profile';

export type SeatClass = 'general' | 'premium' | 'accessible' | 'media';
export const SEAT_CLASSES: SeatClass[] = ['general', 'premium', 'accessible', 'media'];

export interface SeatTable {
  count: number;
  /** seat reference point: centre of the seat pan footprint at tread level, mm */
  x: Float64Array; y: Float64Array; z: Float64Array;
  /** facing (radians, plan angle the spectator looks along) */
  rot: Float32Array;
  tier: Uint8Array;
  sector: Uint8Array; // index into SECTORS
  section: Uint16Array; // per tier, 1-based, counted CCW from the east end
  row: Uint16Array; // per tier, 1-based from the front
  number: Uint16Array; // per section-row, 1-based CCW
  cls: Uint8Array; // index into SEAT_CLASSES
  /** sightline analysis */
  cValue: Float32Array;
  /** eye to centre of the field and to the farthest field corner (FIFA viewing-distance check) */
  distCentre: Float32Array; distFar: Float32Array;
}

export interface SectionInfo { tier: number; section: number; label: string; segment: SegmentId; sector: Sector; seats: number; rows: number; maxRowSeats: number }

export interface SeatResult {
  seats: SeatTable;
  sections: SectionInfo[];
  /** aisle lines per tier for drawing/export: [tier, segment, u] */
  aisles: { tier: number; seg: SegmentId; u: number }[];
}

interface Partition { seg: SegmentId; bounds: number[] }

/** How each segment of a tier is divided into sections (fractions of the segment, 0..1). */
function partitions(ring: PlanRing, prof: TierProfile, seatW: number, aisle: number, maxSeats: number): Partition[] {
  const span = maxSeats * seatW + aisle;
  const dBack = prof.back - SEAT_FROM_BACK; // the longest row governs the corner subdivisions
  return SEGMENTS.map((seg) => {
    const len = segmentLength(ring, seg, isCorner(seg) ? dBack : 0);
    const n = len <= aisle ? 1 : Math.max(1, Math.ceil((len - aisle) / span));
    return { seg, bounds: Array.from({ length: n + 1 }, (_, k) => k / n) };
  });
}

export function sectionLabel(tierIndex: number, section: number) {
  return `${tierIndex + 1}${String(section).padStart(2, '0')}`;
}

export function seatId(t: SeatTable, i: number, tierIds: string[]) {
  return `${tierIds[t.tier[i]]}-${sectionLabel(t.tier[i], t.section[i])}-R${String(t.row[i]).padStart(2, '0')}-S${String(t.number[i]).padStart(2, '0')}`;
}

/** Count seats without storing them (used by the capacity solver). */
export function countSeats(project: Project, ring: PlanRing, profiles: TierProfile[]): number {
  return generate(project, ring, profiles, null, null).count;
}

export function generateSeats(project: Project, ring: PlanRing, profiles: TierProfile[], focus: Rect, fieldLW: [number, number]): SeatResult {
  const n = countSeats(project, ring, profiles);
  const t: SeatTable = {
    count: n,
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), rot: new Float32Array(n),
    tier: new Uint8Array(n), sector: new Uint8Array(n), section: new Uint16Array(n), row: new Uint16Array(n), number: new Uint16Array(n), cls: new Uint8Array(n),
    cValue: new Float32Array(n), distCentre: new Float32Array(n), distFar: new Float32Array(n),
  };
  const r = generate(project, ring, profiles, t, { focus, fieldLW });
  return { seats: t, sections: r.sections, aisles: r.aisles };
}

function generate(project: Project, ring: PlanRing, profiles: TierProfile[], out: SeatTable | null, ctx: { focus: Rect; fieldLW: [number, number] } | null) {
  const { seatWidth: W, aisleWidth: A, maxSeatsBetweenAisles: M, eyeHeight } = project.seating;
  let k = 0;
  const sections: SectionInfo[] = [];
  const aisles: { tier: number; seg: SegmentId; u: number }[] = [];
  profiles.forEach((prof, ti) => {
    const parts = partitions(ring, prof, W, A, Math.max(1, M));
    let sectionNo = 0;
    for (const part of parts) {
      for (const u of part.bounds.slice(0, -1)) aisles.push({ tier: ti, seg: part.seg, u });
      for (let s = 0; s < part.bounds.length - 1; s++) {
        sectionNo++;
        const sectorIdx = SECTORS.indexOf(SECTOR_OF[part.seg]);
        const info: SectionInfo = { tier: ti, section: sectionNo, label: sectionLabel(ti, sectionNo), segment: part.seg, sector: SECTOR_OF[part.seg], seats: 0, rows: 0, maxRowSeats: 0 };
        prof.rows.forEach((row, ri) => {
          const dSeat = row.d + prof.rowDepth - SEAT_FROM_BACK;
          const len = segmentLength(ring, part.seg, dSeat);
          const a = part.bounds[s] * len + A / 2, b = part.bounds[s + 1] * len - A / 2;
          const nSeats = b > a ? Math.floor((b - a) / W + 1e-9) : 0;
          if (nSeats <= 0) return;
          info.rows++;
          info.seats += nSeats;
          info.maxRowSeats = Math.max(info.maxRowSeats, nSeats);
          if (!out || !ctx) { k += nSeats; return; }
          const start = a + (b - a - nSeats * W) / 2;
          const dEye = row.d + prof.rowDepth - EYE_FROM_BACK;
          for (let j = 0; j < nSeats; j++) {
            const u = len > 0 ? (start + (j + 0.5) * W) / len : 0.5;
            const p = pointAt(ring, part.seg, u, dSeat);
            out.x[k] = p.x; out.y[k] = p.y; out.z[k] = row.z;
            out.rot[k] = Math.atan2(-p.ny, -p.nx);
            out.tier[k] = ti; out.sector[k] = sectorIdx;
            out.section[k] = sectionNo; out.row[k] = ri + 1; out.number[k] = j + 1; out.cls[k] = 0;
            // eye point (in plan, EYE_FROM_BACK in front of the riser, i.e. slightly towards the field)
            const ex = p.x - p.nx * (EYE_FROM_BACK - SEAT_FROM_BACK), ey = p.y - p.ny * (EYE_FROM_BACK - SEAT_FROM_BACK), ez = row.z + eyeHeight;
            out.cValue[k] = seatC(ring, prof, ri, ex, ey, ez, dEye, ctx.focus);
            const [L, Wd] = ctx.fieldLW;
            out.distCentre[k] = Math.sqrt(ex * ex + ey * ey + ez * ez);
            const fx = Math.abs(ex) + L / 2, fy = Math.abs(ey) + Wd / 2;
            out.distFar[k] = Math.sqrt(fx * fx + fy * fy + ez * ez);
            k++;
          }
        });
        sections.push(info);
      }
    }
  });
  return { count: k, sections, aisles };
}

/**
 * Seat-level C-value along the true line of sight in plan: from the eye towards the nearest point
 * of the focus boundary, the line crosses the eye ring of the row in front (found by bisection on
 * the plan offset); C is how far the sightline passes above that eye. A tier's first row is
 * checked against its front barrier instead. On the sidelines this equals the section formula;
 * in the corners it accounts for the oblique view.
 */
function seatC(ring: PlanRing, prof: TierProfile, ri: number, ex: number, ey: number, ez: number, dEye: number, f: Rect): number {
  const fx = Math.min(f.maxX, Math.max(f.minX, ex)), fy = Math.min(f.maxY, Math.max(f.minY, ey));
  const D = Math.sqrt((ex - fx) * (ex - fx) + (ey - fy) * (ey - fy));
  if (D < 1) return 0;
  const row = prof.rows[ri];
  const frontD = ri === 0 ? row.d : dEye - prof.rowDepth;
  const frontZ = ri === 0 ? row.z + prof.barrier : prof.rows[ri - 1].eyeZ;
  // bisection along eye → focus for the point where the plan offset equals the front line's offset
  let lo = 0, hi = 1;
  if (planOffset(ring, fx, fy) > frontD) return 0;
  for (let it = 0; it < 22; it++) {
    const m = (lo + hi) / 2;
    const off = planOffset(ring, ex + (fx - ex) * m, ey + (fy - ey) * m);
    if (off > frontD) lo = m; else hi = m;
  }
  const Df = D * (1 - (lo + hi) / 2);
  return (ez * Df) / D - frontZ;
}
