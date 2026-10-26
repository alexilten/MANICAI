/**
 * Bowl plan geometry.
 *
 * The seating bowl is organised around one continuous plan path: the front-row line, a rounded
 * rectangle around the field with independent sideline and end distances and a corner radius.
 * Every row behind it is the exact offset of that path (straights move out, corner radii grow by
 * the same amount), so row depths stay constant all the way round and aisles in the corners stay
 * radial. A square corner (radius 0) therefore opens up into a fan — the classic four-stand layout.
 *
 * Each stand keeps its own first-row distance (Round 02), so the path is a rounded rectangle whose
 * centre can sit off the field centre: a closer north sideline moves that straight in, nothing else.
 *
 * Positions on the path are addressed as (segment, u ∈ [0,1], d) where d is the plan offset
 * behind the front-row line. Segments run counter-clockwise from the east end:
 *
 *        NW ─────── N (north sideline, +Y) ─────── NE
 *        │                                          │
 *   W (west end, −X)          field            E (east end, +X)
 *        │                                          │
 *        SW ─────── S (south sideline, −Y) ─────── SE
 *
 * "North" is the local +Y side of the field; true north is the separate site.northDeg parameter.
 */
import type { Mm } from '../units';

export type SegmentId = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';
export type Sector = 'east' | 'northeast' | 'north' | 'northwest' | 'west' | 'southwest' | 'south' | 'southeast';
export const SEGMENTS: SegmentId[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
export const SECTOR_OF: Record<SegmentId, Sector> = { E: 'east', NE: 'northeast', N: 'north', NW: 'northwest', W: 'west', SW: 'southwest', S: 'south', SE: 'southeast' };
export const SECTOR_LABEL: Record<Sector, string> = {
  north: 'North sideline', south: 'South sideline', east: 'East end', west: 'West end',
  northeast: 'NE corner', northwest: 'NW corner', southeast: 'SE corner', southwest: 'SW corner',
};
export const SECTORS: Sector[] = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southwest', 'southeast'];
export const isCorner = (s: SegmentId) => s.length === 2;

export type StandSeg = 'N' | 'S' | 'E' | 'W';
export type CornerSeg = 'NE' | 'NW' | 'SW' | 'SE';
export const STANDS: StandSeg[] = ['N', 'S', 'E', 'W'];
export const CORNERS: CornerSeg[] = ['NE', 'NW', 'SW', 'SE'];
/** the two stands each corner joins */
export const CORNER_NEIGHBOURS: Record<CornerSeg, [StandSeg, StandSeg]> = { NE: ['N', 'E'], NW: ['N', 'W'], SW: ['S', 'W'], SE: ['S', 'E'] };

export interface PlanRing {
  /** half-length / half-width of the front-row line */
  hx: Mm; hy: Mm;
  /** centre of the front-row line (0,0 unless opposite stands sit at different distances) */
  cx: Mm; cy: Mm;
  /** corner radius at the front-row line */
  r: Mm;
  /** first-row distance of each stand from its field line */
  dist: Record<StandSeg, Mm>;
  /** the nearer of the two sidelines / ends (kept for summaries) */
  sideDistance: Mm; endDistance: Mm;
  /** first-row distance from each field corner, to the nearest point of the corner (governs when a corner pinches in) */
  cornerDist: Record<CornerSeg, Mm>;
  /** the smallest of cornerDist */
  cornerDistance: Mm;
}

export interface Station { x: number; y: number; nx: number; ny: number }

/** `side`/`end` may be one distance for both stands or a per-stand record. */
export function makeRing(fieldLength: Mm, fieldWidth: Mm, side: Mm | Record<StandSeg, Mm>, end: Mm, cornerRadius: Mm): PlanRing {
  const dist: Record<StandSeg, Mm> = typeof side === 'number' ? { N: side, S: side, E: end, W: end } : side;
  const xE = fieldLength / 2 + dist.E, xW = fieldLength / 2 + dist.W, yN = fieldWidth / 2 + dist.N, yS = fieldWidth / 2 + dist.S;
  const hx = (xE + xW) / 2, hy = (yN + yS) / 2;
  const ring: PlanRing = {
    hx, hy, cx: (xE - xW) / 2, cy: (yN - yS) / 2, r: Math.max(0, Math.min(cornerRadius, hx, hy)), dist,
    sideDistance: Math.min(dist.N, dist.S), endDistance: Math.min(dist.E, dist.W),
    cornerDist: { NE: 0, NW: 0, SW: 0, SE: 0 }, cornerDistance: 0,
  };
  const L2 = fieldLength / 2, W2 = fieldWidth / 2;
  ring.cornerDist = { NE: -planOffset(ring, L2, W2), NW: -planOffset(ring, -L2, W2), SW: -planOffset(ring, -L2, -W2), SE: -planOffset(ring, L2, -W2) };
  ring.cornerDistance = Math.min(...CORNERS.map((c) => ring.cornerDist[c]));
  return ring;
}

const CORNER: Record<string, { cx: number; cy: number; a0: number }> = {
  NE: { cx: 1, cy: 1, a0: 0 }, NW: { cx: -1, cy: 1, a0: Math.PI / 2 },
  SW: { cx: -1, cy: -1, a0: Math.PI }, SE: { cx: 1, cy: -1, a0: Math.PI * 1.5 },
};

/** Length of a segment at offset d behind the front-row line. */
export function segmentLength(ring: PlanRing, seg: SegmentId, d: Mm): Mm {
  const { hx, hy, r } = ring;
  // inside the front-row line past the corner radius (d < −r, e.g. a roof edge over the field) the
  // offset path is a sharp rectangle: the straights shorten and the corners close to a point
  const e = Math.min(0, r + d);
  if (seg === 'E' || seg === 'W') return 2 * (hy - r + e);
  if (seg === 'N' || seg === 'S') return 2 * (hx - r + e);
  return (Math.PI / 2) * Math.max(0, r + d);
}

/** Point and outward normal on the path at (segment, u, d). */
export function pointAt(ring: PlanRing, seg: SegmentId, u: number, d: Mm): Station {
  const { hx, hy, r, cx, cy } = ring;
  const e = Math.min(0, r + d); // see segmentLength
  const sx = hx - r + e, sy = hy - r + e;
  switch (seg) {
    case 'E': return { x: cx + hx + d, y: cy - sy + 2 * sy * u, nx: 1, ny: 0 };
    case 'N': return { x: cx + sx - 2 * sx * u, y: cy + hy + d, nx: 0, ny: 1 };
    case 'W': return { x: cx - hx - d, y: cy + sy - 2 * sy * u, nx: -1, ny: 0 };
    case 'S': return { x: cx - sx + 2 * sx * u, y: cy - hy - d, nx: 0, ny: -1 };
    default: {
      const c = CORNER[seg];
      const a = c.a0 + u * Math.PI / 2;
      const nx = Math.cos(a), ny = Math.sin(a);
      const rd = Math.max(0, r + d);
      return { x: cx + c.cx * sx + rd * nx, y: cy + c.cy * sy + rd * ny, nx, ny };
    }
  }
}

/** Signed plan offset of a point from the front-row line (positive behind it): the rounded-rectangle SDF. */
export function planOffset(ring: PlanRing, x: number, y: number): number {
  const qx = Math.abs(x - ring.cx) - (ring.hx - ring.r), qy = Math.abs(y - ring.cy) - (ring.hy - ring.r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - ring.r;
}

/** Stations sampling the whole closed path (corners subdivided), counter-clockwise from the east end. */
export function stations(ring: PlanRing, cornerSteps = 24): { seg: SegmentId; u: number }[] {
  const out: { seg: SegmentId; u: number }[] = [];
  for (const seg of SEGMENTS) {
    const n = isCorner(seg) ? cornerSteps : 1;
    const straightLen = segmentLength(ring, seg, 0);
    if (!isCorner(seg) && straightLen < 1e-6) continue;
    for (let k = 0; k <= n; k++) {
      if (k === 0 && out.length) continue; // shared with the previous segment's end
      out.push({ seg, u: k / n });
    }
  }
  // the loop closes back onto the first station; drop a duplicate end if the last coincides
  return out;
}

/** Area enclosed by the path at offset d (rounded rectangle). */
export function enclosedArea(ring: PlanRing, d: Mm): number {
  const w = 2 * (ring.hx + d), h = 2 * (ring.hy + d), r = Math.max(0, ring.r + d);
  return w * h - (4 - Math.PI) * r * r;
}

export function perimeter(ring: PlanRing, d: Mm): number {
  return SEGMENTS.reduce((s, seg) => s + segmentLength(ring, seg, d), 0);
}
