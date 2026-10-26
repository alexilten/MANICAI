/**
 * Plan helpers for the studies: where a world point lies on the bowl's offset paths.
 */
import { planOffset, SEGMENTS, segmentLength, type PlanRing, type SegmentId } from '../core/engine/plan';

const CORNER_SIGN: Record<string, [number, number, number]> = { NE: [1, 1, 0], NW: [-1, 1, Math.PI / 2], SW: [-1, -1, Math.PI], SE: [1, -1, Math.PI * 1.5] };

/** The plan region (segment), position along it (u, as pointAt) and offset d of a world point. */
export function locateXY(ring: PlanRing, x: number, y: number): { seg: SegmentId; u: number; d: number } {
  const d = planOffset(ring, x, y);
  const e = Math.min(0, ring.r + d);
  const sx = ring.hx - ring.r + e, sy = ring.hy - ring.r + e;
  const ax = x - ring.cx, ay = y - ring.cy;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (Math.abs(ax) > sx && Math.abs(ay) > sy && ring.r + d > 0) {
    const seg = (ax > 0 ? (ay > 0 ? 'NE' : 'SE') : (ay > 0 ? 'NW' : 'SW')) as SegmentId;
    const [kx, ky, a0] = CORNER_SIGN[seg];
    let a = Math.atan2(ay - ky * sy, ax - kx * sx) - a0;
    a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (a > 1.75 * Math.PI) a -= 2 * Math.PI;
    return { seg, u: clamp(a / (Math.PI / 2)), d };
  }
  // straights: whichever side the point is further past
  if (Math.abs(ay) - sy > Math.abs(ax) - sx) {
    return ay > 0 ? { seg: 'N', u: sx > 0 ? clamp((sx - ax) / (2 * sx)) : 0.5, d } : { seg: 'S', u: sx > 0 ? clamp((ax + sx) / (2 * sx)) : 0.5, d };
  }
  return ax > 0 ? { seg: 'E', u: sy > 0 ? clamp((ay + sy) / (2 * sy)) : 0.5, d } : { seg: 'W', u: sy > 0 ? clamp((sy - ay) / (2 * sy)) : 0.5, d };
}

/** Arc length from the start of the east straight to (seg, u), measured along the path at offset d. */
export function arcAt(ring: PlanRing, seg: SegmentId, u: number, d: number): number {
  let s = 0;
  for (const g of SEGMENTS) { if (g === seg) return s + u * segmentLength(ring, g, d); s += segmentLength(ring, g, d); }
  return s;
}

/** Shortest distance along a closed path of length P between two arc positions on it. */
export function alongPath(P: number, s0: number, s1: number): number {
  const a = Math.abs(s1 - s0) % P;
  return Math.min(a, P - a);
}

