/**
 * Terrace solids for display: each tier's section outline swept round the closed plan path.
 * Because every row is an exact offset of the front-row line, a profile point (d, z) maps to
 * station + normal · d — the sweep is exact on the straights and in the corners.
 *
 * Output is plain arrays (positions in mm, local frame) so the renderer, GLB export and tests
 * can share it. Each outline edge gets its own vertices so terrace edges stay crisp.
 */
import { pointAt, stations, type PlanRing } from './plan';
import type { TierProfile } from './profile';

export interface SweptMesh { positions: Float32Array; normals: Float32Array; index: Uint32Array }

export function sweepTier(ring: PlanRing, prof: TierProfile, cornerSteps = 24): SweptMesh {
  const st = stations(ring, cornerSteps).map((s) => pointAt(ring, s.seg, s.u, 0));
  // close the loop
  st.push(st[0]);
  const ol = prof.outline;
  const nE = ol.length, nS = st.length;
  const pos = new Float32Array(nE * nS * 2 * 3);
  const nor = new Float32Array(nE * nS * 2 * 3);
  const idx: number[] = [];
  let v = 0;
  for (let e = 0; e < nE; e++) {
    const [d0, z0] = ol[e], [d1, z1] = ol[(e + 1) % nE];
    const len = Math.hypot(d1 - d0, z1 - z0) || 1;
    // outline is counter-clockwise in (d, z): outward normal is the edge direction turned clockwise
    const nd = (z1 - z0) / len, nz = -(d1 - d0) / len;
    const base = v;
    for (let k = 0; k < nS; k++) {
      const p = st[k];
      for (const [d, z] of [[d0, z0], [d1, z1]]) {
        pos[v * 3] = p.x + p.nx * d; pos[v * 3 + 1] = p.y + p.ny * d; pos[v * 3 + 2] = z;
        nor[v * 3] = p.nx * nd; nor[v * 3 + 1] = p.ny * nd; nor[v * 3 + 2] = nz;
        v++;
      }
    }
    for (let k = 0; k < nS - 1; k++) {
      const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3;
      // the path runs counter-clockwise in plan; this winding faces the outward normal
      idx.push(a, c, b, b, c, d);
    }
  }
  return { positions: pos, normals: nor, index: new Uint32Array(idx) };
}
