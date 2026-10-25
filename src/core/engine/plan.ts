/**
 * Bowl plan geometry.
 *
 * The seating bowl is organised around one continuous plan path: the front-row line, a rounded
 * rectangle around the field with independent sideline and end distances and a corner radius.
 * Every row behind it is the exact offset of that path (straights move out, corner radii grow by
 * the same amount), so row depths stay constant all the way round and aisles in the corners stay
 * radial. A square corner (radius 0) therefore opens up into a fan — the classic four-stand layout.
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

export interface PlanRing {
  /** half-length / half-width of the front-row line */
  hx: Mm; hy: Mm;
  /** corner radius at the front-row line */
  r: Mm;
  /** distances from the field boundary used to build it */
  sideDistance: Mm; endDistance: Mm;
  /** first-row distance from the field corner, measured to the nearest point of the corner (governs when the corner pinches in) */
  cornerDistance: Mm;
}

export interface Station { x: number; y: number; nx: number; ny: number }

export function makeRing(fieldLength: Mm, fieldWidth: Mm, sideDistance: Mm, endDistance: Mm, cornerRadius: Mm): PlanRing {
  const hx = fieldLength / 2 + endDistance, hy = fieldWidth / 2 + sideDistance;
  const ring = { hx, hy, r: Math.max(0, Math.min(cornerRadius, hx, hy)), sideDistance, endDistance, cornerDistance: 0 };
  ring.cornerDistance = -planOffset(ring, fieldLength / 2, fieldWidth / 2);
  return ring;
}

const CORNER: Record<string, { cx: number; cy: number; a0: number }> = {
  NE: { cx: 1, cy: 1, a0: 0 }, NW: { cx: -1, cy: 1, a0: Math.PI / 2 },
  SW: { cx: -1, cy: -1, a0: Math.PI }, SE: { cx: 1, cy: -1, a0: Math.PI * 1.5 },
};

/** Length of a segment at offset d behind the front-row line. */
export function segmentLength(ring: PlanRing, seg: SegmentId, d: Mm): Mm {
  const { hx, hy, r } = ring;
  if (seg === 'E' || seg === 'W') return 2 * (hy - r);
  if (seg === 'N' || seg === 'S') return 2 * (hx - r);
  return (Math.PI / 2) * (r + d);
}

/** Point and outward normal on the path at (segment, u, d). */
export function pointAt(ring: PlanRing, seg: SegmentId, u: number, d: Mm): Station {
  const { hx, hy, r } = ring;
  const sx = hx - r, sy = hy - r;
  switch (seg) {
    case 'E': return { x: hx + d, y: -sy + 2 * sy * u, nx: 1, ny: 0 };
    case 'N': return { x: sx - 2 * sx * u, y: hy + d, nx: 0, ny: 1 };
    case 'W': return { x: -hx - d, y: sy - 2 * sy * u, nx: -1, ny: 0 };
    case 'S': return { x: -sx + 2 * sx * u, y: -hy - d, nx: 0, ny: -1 };
    default: {
      const c = CORNER[seg];
      const a = c.a0 + u * Math.PI / 2;
      const nx = Math.cos(a), ny = Math.sin(a);
      return { x: c.cx * sx + (r + d) * nx, y: c.cy * sy + (r + d) * ny, nx, ny };
    }
  }
}

/** Signed plan offset of a point from the front-row line (positive behind it): the rounded-rectangle SDF. */
export function planOffset(ring: PlanRing, x: number, y: number): number {
  const qx = Math.abs(x) - (ring.hx - ring.r), qy = Math.abs(y) - (ring.hy - ring.r);
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
  const w = 2 * (ring.hx + d), h = 2 * (ring.hy + d), r = ring.r + d;
  return w * h - (4 - Math.PI) * r * r;
}

export function perimeter(ring: PlanRing, d: Mm): number {
  return SEGMENTS.reduce((s, seg) => s + segmentLength(ring, seg, d), 0);
}
