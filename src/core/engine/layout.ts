/**
 * Independent stands and corners (Round 02): how many rows of each tier every plan region carries.
 *
 * The bowl stays one continuous ring per tier: each tier keeps a single row sequence (one rake all
 * the way round, so corners join the stands without steps in the treads). A region either carries a
 * leading part of that sequence or nothing:
 *   • stands (N, S, E, W) take the tier's row count, or their own override, or none when open;
 *   • corners follow the smaller of their two neighbouring stands unless overridden or opened;
 *   • a region can only run a tier past the tier's own row count where no tier sits above it there
 *     (more rows would run into the tier above); such overrides are clamped and reported.
 */
import type { Project } from '../schema';
import type { Mm } from '../units';
import { CORNERS, CORNER_NEIGHBOURS, SEGMENTS, STANDS, type SegmentId, type StandSeg } from './plan';

/** rows of each tier (by index) carried by each plan region */
export type RegionRows = Record<SegmentId, number[]>;

export interface Layout { rows: RegionRows; clamped: { seg: SegmentId; tier: string; asked: number; got: number }[] }

export function standDistances(p: Project): Record<StandSeg, Mm> {
  const st = p.bowl.stands ?? {};
  return {
    N: st.N?.distance ?? p.bowl.sideDistance, S: st.S?.distance ?? p.bowl.sideDistance,
    E: st.E?.distance ?? p.bowl.endDistance, W: st.W?.distance ?? p.bowl.endDistance,
  };
}

export function regionRows(p: Project): Layout {
  const st = p.bowl.stands ?? {};
  const base = p.tiers.map((t) => Math.max(1, Math.round(t.rows)));
  const rows = {} as RegionRows;
  const asked = {} as RegionRows;
  for (const seg of STANDS) {
    const s = st[seg];
    asked[seg] = p.tiers.map((t, i) => (s?.open ? 0 : Math.max(0, Math.round(s?.rows?.[t.id] ?? base[i]))));
  }
  for (const seg of CORNERS) {
    const s = st[seg];
    const [a, b] = CORNER_NEIGHBOURS[seg];
    asked[seg] = p.tiers.map((t, i) => (s?.open ? 0 : Math.max(0, Math.round(s?.rows?.[t.id] ?? Math.min(asked[a][i], asked[b][i])))));
  }
  const clamped: Layout['clamped'] = [];
  for (const seg of SEGMENTS) {
    rows[seg] = asked[seg].map((n, i) => {
      const covered = asked[seg].some((m, j) => j > i && m > 0);
      if (covered && n > base[i]) { clamped.push({ seg, tier: p.tiers[i].id, asked: n, got: base[i] }); return base[i]; }
      return n;
    });
  }
  return { rows, clamped };
}
