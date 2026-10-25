/**
 * Terrace solids for display: each tier's section outline swept round the plan path, region by
 * region. Because every row is an exact offset of the front-row line, a profile point (d, z) maps
 * to station + normal · d — the sweep is exact on the straights and in the corners.
 *
 * Regions carry their own number of rows (Round 02), so each region sweeps its own outline and is
 * closed with a section-shaped end cap wherever its neighbour carries a different number of rows
 * (an open end, a taller stand). Output is plain arrays (positions in mm, local frame) so the
 * renderer, GLB export and tests can share it. Each outline edge gets its own vertices so terrace
 * edges stay crisp.
 */
import type { RegionRows } from './layout';
import { isCorner, pointAt, segmentLength, SEGMENTS, type PlanRing, type SegmentId } from './plan';
import { tierOutline, type TierProfile } from './profile';

export interface SweptMesh { positions: Float32Array; normals: Float32Array; index: Uint32Array }

export function sweepTier(ring: PlanRing, prof: TierProfile, regions: RegionRows, cornerSteps = 24): SweptMesh {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const live = SEGMENTS.filter((seg) => segmentLength(ring, seg, 0) > 1e-6 || isCorner(seg));
  const rowsOf = (seg: SegmentId) => regions[seg][prof.index] ?? 0;
  live.forEach((seg, si) => {
    const n = rowsOf(seg);
    if (n <= 0) return;
    const ol = tierOutline(prof, n);
    const steps = isCorner(seg) ? cornerSteps : 1;
    const st = Array.from({ length: steps + 1 }, (_, k) => pointAt(ring, seg, k / steps, 0));
    const nE = ol.length;
    for (let e = 0; e < nE; e++) {
      const [d0, z0] = ol[e], [d1, z1] = ol[(e + 1) % nE];
      const len = Math.hypot(d1 - d0, z1 - z0) || 1;
      // outline is counter-clockwise in (d, z): outward normal is the edge direction turned clockwise
      const nd = (z1 - z0) / len, nz = -(d1 - d0) / len;
      const base = pos.length / 3;
      for (const p of st) {
        for (const [d, z] of [[d0, z0], [d1, z1]]) {
          pos.push(p.x + p.nx * d, p.y + p.ny * d, z);
          nor.push(p.nx * nd, p.ny * nd, nz);
        }
      }
      for (let k = 0; k < st.length - 1; k++) {
        const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
        // the path runs counter-clockwise in plan; this winding faces the outward normal
        idx.push(a, c, b, b, c, d);
      }
    }
    // end caps where the neighbouring region carries a different section
    const prev = live[(si - 1 + live.length) % live.length], next = live[(si + 1) % live.length];
    if (rowsOf(prev) !== n) cap(pos, nor, idx, ol, st[0], -1);
    if (rowsOf(next) !== n) cap(pos, nor, idx, ol, st[st.length - 1], 1);
  });
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), index: new Uint32Array(idx) };
}

/** A section-shaped cap at a station, facing along (+1) or against (−1) the counter-clockwise path. */
function cap(pos: number[], nor: number[], idx: number[], ol: [number, number][], p: { x: number; y: number; nx: number; ny: number }, dir: 1 | -1) {
  // path tangent (counter-clockwise) is the outward normal turned left
  const tx = -p.ny * dir, ty = p.nx * dir;
  const base = pos.length / 3;
  for (const [d, z] of ol) { pos.push(p.x + p.nx * d, p.y + p.ny * d, z); nor.push(tx, ty, 0); }
  for (const [a, b, c] of earcut(ol)) {
    // keep the triangle facing (tx, ty)
    const A = ol[a], B = ol[b], C = ol[c];
    const cross = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); // in (d, z)
    // (d, z) → world: d along the normal, z up; a CCW triangle in (d, z) faces normal × up = −tangent(CCW)
    const facesTangent = cross < 0;
    if (facesTangent === (dir === 1)) idx.push(base + a, base + b, base + c);
    else idx.push(base + a, base + c, base + b);
  }
}

/** Ear-clipping triangulation of a simple polygon (indices into `pts`). */
export function earcut(pts: [number, number][]): [number, number, number][] {
  const n = pts.length;
  if (n < 3) return [];
  const area = pts.reduce((a, p, i) => { const q = pts[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const V = Array.from({ length: n }, (_, i) => i);
  if (area < 0) V.reverse();
  const tris: [number, number, number][] = [];
  const inside = (p: number[], a: number[], b: number[], c: number[]) => {
    const s = (u: number[], v: number[], w: number[]) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return s(a, b, p) >= -1e-9 && s(b, c, p) >= -1e-9 && s(c, a, p) >= -1e-9;
  };
  let guard = 0;
  while (V.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i - 1 + V.length) % V.length], ib = V[i], ic = V[(i + 1) % V.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const convex = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-9;
      if (!convex) continue;
      if (V.some((j) => j !== ia && j !== ib && j !== ic && inside(pts[j], a, b, c))) continue;
      tris.push([ia, ib, ic]);
      V.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (V.length === 3) tris.push([V[0], V[1], V[2]]);
  return tris;
}
