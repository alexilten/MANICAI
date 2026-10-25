/** Vomitory opening geometry, shared by the viewport and the Rhino export. */
import { pointAt, type PlanRing } from './plan';
import type { Vomitory } from './seats';

/** Faces of the opening as quads over the eight corners from `vomCorners`. */
export const VOM_QUADS = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];

/** The eight corners of a vomitory opening (front/back × bottom/top × left/right), mm. */
export function vomCorners(ring: PlanRing, v: Vomitory): number[][] {
  const p = pointAt(ring, v.seg, v.u, 0);
  const tx = -p.ny, ty = p.nx; // along the row
  const lift = 30;
  const sec: [number, number][] = [[v.dFront, v.zFloor], [v.dBack, v.zFloor], [v.dBack, v.zTop + lift], [v.dFront, v.zMouth + lift]];
  const out: number[][] = [];
  for (const side of [-1, 1]) for (const [d, z] of sec) out.push([p.x + p.nx * d + tx * side * v.width / 2, p.y + p.ny * d + ty * side * v.width / 2, z]);
  return out;
}

export function vomTriangles(ring: PlanRing, v: Vomitory): number[][] {
  const c = vomCorners(ring, v);
  const out: number[][] = [];
  for (const [a, b, cc, d] of VOM_QUADS) out.push([...c[a], ...c[b], ...c[cc]], [...c[a], ...c[cc], ...c[d]]);
  return out;
}
