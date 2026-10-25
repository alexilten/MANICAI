/**
 * Individual seat generation.
 *
 * Seats are real positions, not an area estimate: every row ring is cut into sections by radial
 * aisles, and each section-row holds as many whole seats of the tier's seat width as fit between
 * the aisle edges. Gross capacity is the count of these positions.
 *
 * Aisles sit at every segment junction (sideline/corner/end) and evenly between them, spaced so no
 * row holds more than `maxSeatsBetweenAisles` seats. Straight aisles are perpendicular to the
 * field; corner aisles are radial (equal angles), so they line up from row to row.
 *
 * Round 02 exclusions turn gross into net capacity. Every gross position stays in the table with a
 * status, so the model can show and export what was removed and why:
 *   • vomitories: a portal centred in every n-th section, from its mouth row back until the treads
 *     clear the tunnel (floor at the tread in front of the mouth, VOM_CLEAR above it);
 *   • accessible platforms: each wheelchair position with its companion seat takes ⌈1400 / seat width⌉
 *     seats of the platform row and the seats behind it (FIFA 1.4 × 1.4 m position). The platform is
 *     raised by the difference between seated and wheelchair eye heights (PLATFORM_RAISE), so the
 *     wheelchair user's eye sits where a seated spectator's would and keeps the row's C-value;
 *   • optionally, seats below the minimum C-value.
 *
 * Storage is columnar (typed arrays) so 100,000 seats stay cheap; every seat is still individually
 * addressable by index and by a stable id built from tier · section · row · seat number.
 */
import type { Project } from '../schema';
import type { Rect } from '../sports';
import type { RegionRows } from './layout';
import { isCorner, planOffset, pointAt, SECTORS, SECTOR_OF, segmentLength, SEGMENTS, type PlanRing, type SegmentId, type Sector } from './plan';
import { EYE_FROM_BACK, SEAT_FROM_BACK, type TierProfile } from './profile';

export type SeatClass = 'general' | 'premium' | 'wheelchair' | 'companion';
export const SEAT_CLASSES: SeatClass[] = ['general', 'premium', 'wheelchair', 'companion'];
export const SEAT_CLASS_LABEL: Record<SeatClass, string> = { general: 'General admission', premium: 'Club / premium', wheelchair: 'Wheelchair positions', companion: 'Companion seats' };
export type SeatStatus = 'active' | 'vomitory' | 'platform' | 'sightline';
export const SEAT_STATUS: SeatStatus[] = ['active', 'vomitory', 'platform', 'sightline'];
export const SEAT_STATUS_LABEL: Record<SeatStatus, string> = { active: 'In use', vomitory: 'Removed for vomitories', platform: 'Removed for wheelchair platforms', sightline: 'Below the minimum C-value' };

/** vertical clearance from a vomitory floor to the underside of the treads above it (2.4 m headroom + 300 mm structure; assumption) */
export const VOM_CLEAR = 2700;
/** a wheelchair position with its companion seat, across the row (FIFA 1.4 m × 1.4 m) */
export const WHEELCHAIR_BAY = 1400;

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
  status: Uint8Array; // index into SEAT_STATUS; only 'active' positions count in net capacity
  /** sightline analysis */
  cValue: Float32Array;
  /** eye to centre of the field and to the farthest field corner (FIFA viewing-distance check) */
  distCentre: Float32Array; distFar: Float32Array;
}

export interface SectionInfo { tier: number; section: number; label: string; segment: SegmentId; sector: Sector; seats: number; net: number; rows: number; maxRowSeats: number }

export interface Vomitory {
  id: string; tier: number; section: number; seg: SegmentId;
  /** section centre along the segment (0..1) */
  u: number;
  /** plan offsets of the opening: nosing of the mouth row → back of the last removed row */
  dFront: number; dBack: number;
  /** tunnel floor, the mouth row's tread and the tread level at the back of the opening */
  zFloor: number; zMouth: number; zTop: number;
  width: number; rowsRemoved: number;
}

export interface SeatResult {
  seats: SeatTable;
  sections: SectionInfo[];
  /** aisle lines per tier for drawing/export: [tier, segment, u] */
  aisles: { tier: number; seg: SegmentId; u: number }[];
  vomitories: Vomitory[];
  counts: SeatCounts;
}

export interface SeatCounts { gross: number; net: number; byStatus: number[]; byClass: number[] }

interface Partition { seg: SegmentId; bounds: number[] }

/** How each segment of a tier is divided into sections (fractions of the segment, 0..1). */
function partitions(ring: PlanRing, prof: TierProfile, regions: RegionRows, seatW: number, aisle: number, maxSeats: number): Partition[] {
  const span = maxSeats * seatW + aisle;
  return SEGMENTS.map((seg) => {
    const n = regions[seg][prof.index] ?? 0;
    if (n <= 0) return { seg, bounds: [] };
    const dBack = prof.rows[n - 1].d + prof.rowDepth - SEAT_FROM_BACK; // the longest row governs the corner subdivisions
    const len = segmentLength(ring, seg, isCorner(seg) ? dBack : 0);
    const k = len <= aisle ? 1 : Math.max(1, Math.ceil((len - aisle) / span));
    return { seg, bounds: Array.from({ length: k + 1 }, (_, j) => j / k) };
  });
}

export function sectionLabel(tierIndex: number, section: number) {
  return `${tierIndex + 1}${String(section).padStart(2, '0')}`;
}

export function seatId(t: SeatTable, i: number, tierIds: string[]) {
  return `${tierIds[t.tier[i]]}-${sectionLabel(t.tier[i], t.section[i])}-R${String(t.row[i]).padStart(2, '0')}-S${String(t.number[i]).padStart(2, '0')}`;
}

export interface SeatContext { focus: Rect; fieldLW: [number, number] }

/** Count gross and net positions without storing them (used by the capacity tools). */
export function countSeats(project: Project, ring: PlanRing, profiles: TierProfile[], regions: RegionRows, ctx: SeatContext): SeatCounts {
  return generate(project, ring, profiles, regions, null, ctx).counts;
}

export function generateSeats(project: Project, ring: PlanRing, profiles: TierProfile[], regions: RegionRows, ctx: SeatContext): SeatResult {
  const n = countSeats(project, ring, profiles, regions, ctx).gross;
  const t: SeatTable = {
    count: n,
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n), rot: new Float32Array(n),
    tier: new Uint8Array(n), sector: new Uint8Array(n), section: new Uint16Array(n), row: new Uint16Array(n), number: new Uint16Array(n),
    cls: new Uint8Array(n), status: new Uint8Array(n),
    cValue: new Float32Array(n), distCentre: new Float32Array(n), distFar: new Float32Array(n),
  };
  const r = generate(project, ring, profiles, regions, t, ctx);
  return { seats: t, sections: r.sections, aisles: r.aisles, vomitories: r.vomitories, counts: r.counts };
}

/** Platform height above the tread that brings a wheelchair user's eye up to the seated eye height. */
export const platformRaise = (p: Project) => Math.max(0, p.seating.eyeHeight - (p.seating.wheelchairEyeHeight ?? p.seating.eyeHeight));

const CLS = { general: 0, premium: 1, wheelchair: 2, companion: 3 };
const ST = { active: 0, vomitory: 1, platform: 2, sightline: 3 };

function generate(project: Project, ring: PlanRing, profiles: TierProfile[], regions: RegionRows, out: SeatTable | null, ctx: SeatContext) {
  const { aisleWidth: A, maxSeatsBetweenAisles: M, eyeHeight } = project.seating;
  const wcEye = project.seating.wheelchairEyeHeight ?? eyeHeight;
  const wcRaise = platformRaise(project);
  const sl = project.sightlines;
  const counts: SeatCounts = { gross: 0, net: 0, byStatus: SEAT_STATUS.map(() => 0), byClass: SEAT_CLASSES.map(() => 0) };
  let k = 0;
  const sections: SectionInfo[] = [];
  const aisles: { tier: number; seg: SegmentId; u: number }[] = [];
  const vomitories: Vomitory[] = [];
  profiles.forEach((prof, ti) => {
    const tp = project.tiers[ti];
    const W = tp.seatWidth ?? project.seating.seatWidth;
    const baseCls = tp.kind === 'club' ? CLS.premium : CLS.general;
    const parts = partitions(ring, prof, regions, W, A, Math.max(1, M));
    const vom = tp.vomitories;
    const acc = tp.accessible;
    let sectionNo = 0;
    for (const part of parts) {
      const nRows = regions[part.seg][ti] ?? 0;
      for (const u of part.bounds.slice(0, -1)) aisles.push({ tier: ti, seg: part.seg, u });
      for (let s = 0; s < part.bounds.length - 1; s++) {
        sectionNo++;
        const sectorIdx = SECTORS.indexOf(SECTOR_OF[part.seg]);
        const info: SectionInfo = { tier: ti, section: sectionNo, label: sectionLabel(ti, sectionNo), segment: part.seg, sector: SECTOR_OF[part.seg], seats: 0, net: 0, rows: 0, maxRowSeats: 0 };
        const u0 = part.bounds[s], u1 = part.bounds[s + 1], uMid = (u0 + u1) / 2;
        // seats of one row of this section: length of the row ring, first seat centre, count
        const rowSeats = (ri: number) => {
          const dSeat = prof.rows[ri].d + prof.rowDepth - SEAT_FROM_BACK;
          const len = segmentLength(ring, part.seg, dSeat);
          const a = u0 * len + A / 2, b = u1 * len - A / 2;
          const n = b > a ? Math.floor((b - a) / W + 1e-9) : 0;
          return { dSeat, len, n, start: a + (b - a - n * W) / 2 };
        };

        // vomitory rows for this section
        let vFrom = -1, vTo = -1;
        if (vom?.enabled && nRows > 2 && (sectionNo - 1) % Math.max(1, Math.round(vom.every)) === 0) {
          const m0 = Math.min(nRows - 1, Math.max(0, Math.round(vom.mouthRow) - 1));
          const floor = m0 > 0 ? prof.rows[m0 - 1].z : prof.rows[0].z;
          let m1 = m0;
          while (m1 < nRows && prof.rows[m1].z - floor < VOM_CLEAR) m1++;
          if (m1 > m0) {
            vFrom = m0; vTo = m1;
            vomitories.push({
              id: `VOM.${tp.id}.${sectionLabel(ti, sectionNo)}`, tier: ti, section: sectionNo, seg: part.seg, u: uMid,
              dFront: prof.rows[m0].d, dBack: prof.rows[m1 - 1].d + prof.rowDepth, zFloor: floor, zMouth: prof.rows[m0].z, zTop: prof.rows[m1 - 1].z,
              width: vom.width, rowsRemoved: m1 - m0,
            });
          }
        }
        const inVom = (ri: number, sPos: number, len: number) => ri >= vFrom && ri < vTo && Math.abs(sPos - uMid * len) < (vom.width + W) / 2;

        // wheelchair platform: groups of seats in the platform row (alternately from each aisle end), and the seats behind them
        const groups: { j0: number; j1: number; uA: number; uB: number }[] = [];
        let pRow = -1;
        if (acc && acc.perSection > 0 && nRows > 0) {
          pRow = acc.row <= 0 ? nRows - 1 : Math.min(nRows - 1, acc.row - 1);
          const r = rowSeats(pRow);
          const K = Math.max(2, Math.ceil(WHEELCHAIR_BAY / W - 1e-9));
          const taken = new Uint8Array(r.n);
          for (let p = 0; p < acc.perSection; p++) {
            const g = p >> 1;
            const j0 = p % 2 === 0 ? g * K : r.n - (g + 1) * K;
            const j1 = j0 + K;
            if (j0 < 0 || j1 > r.n) break;
            let clash = false;
            for (let j = j0; j < j1; j++) if (taken[j] || inVom(pRow, r.start + (j + 0.5) * W, r.len)) clash = true;
            if (clash) continue;
            for (let j = j0; j < j1; j++) taken[j] = 1;
            groups.push({ j0, j1, uA: (r.start + j0 * W) / r.len, uB: (r.start + j1 * W) / r.len });
          }
        }

        for (let ri = 0; ri < nRows; ri++) {
          const row = prof.rows[ri];
          const { dSeat, len, n: nSeats, start } = rowSeats(ri);
          if (nSeats <= 0) continue;
          info.rows++;
          info.seats += nSeats;
          info.maxRowSeats = Math.max(info.maxRowSeats, nSeats);
          const dEye = row.eyeD;
          for (let j = 0; j < nSeats; j++) {
            const sPos = start + (j + 0.5) * W;
            let u = len > 0 ? sPos / len : 0.5;
            let cls = baseCls, status = ST.active;
            if (inVom(ri, sPos, len)) status = ST.vomitory;
            else if (ri === pRow) {
              const g = groups.find((q) => j >= q.j0 && j < q.j1);
              if (g) {
                // the seat next to the aisle becomes the wheelchair space (centred on the rest of the bay), the innermost the companion seat
                const fromStart = g.j0 === 0 || g.j0 < nSeats / 2;
                const wcJ = fromStart ? g.j0 : g.j1 - 1, compJ = fromStart ? g.j1 - 1 : g.j0;
                if (j === compJ) cls = CLS.companion;
                else if (j === wcJ) {
                  cls = CLS.wheelchair;
                  const a = fromStart ? g.j0 : g.j0 + 1, b = fromStart ? g.j1 - 1 : g.j1;
                  u = (start + ((a + b) / 2) * W) / len;
                } else status = ST.platform;
              }
            } else if (ri === pRow + 1 && groups.some((q) => u > q.uA && u < q.uB)) status = ST.platform;

            counts.gross++;
            const wantC = !!out || (sl.excludeBelowMin && status === ST.active);
            let c = 0, ex = 0, ey = 0, ez = 0, p = null as ReturnType<typeof pointAt> | null;
            if (wantC) {
              p = pointAt(ring, part.seg, u, dSeat);
              // eye point (in plan, EYE_FROM_BACK in front of the riser, i.e. slightly towards the field)
              ex = p.x - p.nx * (EYE_FROM_BACK - SEAT_FROM_BACK); ey = p.y - p.ny * (EYE_FROM_BACK - SEAT_FROM_BACK);
              ez = row.z + (cls === CLS.wheelchair ? wcRaise + wcEye : eyeHeight);
              c = seatC(ring, prof, ri, ex, ey, ez, dEye, ctx.focus);
              if (sl.excludeBelowMin && status === ST.active && (cls === CLS.general || cls === CLS.premium) && c < sl.minC - 0.5) status = ST.sightline;
            }
            counts.byStatus[status]++;
            if (status === ST.active) { counts.net++; counts.byClass[cls]++; info.net++; }
            if (!out || !p) { k++; continue; }
            out.x[k] = p.x; out.y[k] = p.y; out.z[k] = row.z + (cls === CLS.wheelchair ? wcRaise : 0);
            out.rot[k] = Math.atan2(-p.ny, -p.nx);
            out.tier[k] = ti; out.sector[k] = sectorIdx;
            out.section[k] = sectionNo; out.row[k] = ri + 1; out.number[k] = j + 1;
            out.cls[k] = cls; out.status[k] = status;
            out.cValue[k] = c;
            const [L, Wd] = ctx.fieldLW;
            out.distCentre[k] = Math.sqrt(ex * ex + ey * ey + ez * ez);
            const fx = Math.abs(ex) + L / 2, fy = Math.abs(ey) + Wd / 2;
            out.distFar[k] = Math.sqrt(fx * fx + fy * fy + ez * ez);
            k++;
          }
        }
        sections.push(info);
      }
    }
  });
  return { counts, sections, aisles, vomitories };
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
  const frontD = ri === 0 ? row.d : prof.rows[ri - 1].eyeD;
  const frontZ = ri === 0 ? row.z + prof.barrier : prof.rows[ri - 1].eyeZ;
  // bisection along eye → focus for the point where the plan offset equals the front line's offset
  let lo = 0, hi = 1;
  if (planOffset(ring, fx, fy) > frontD || dEye <= frontD) return 0;
  for (let it = 0; it < 22; it++) {
    const m = (lo + hi) / 2;
    const off = planOffset(ring, ex + (fx - ex) * m, ey + (fy - ey) * m);
    if (off > frontD) lo = m; else hi = m;
  }
  const Df = D * (1 - (lo + hi) / 2);
  return (ez * Df) / D - frontZ;
}
