/**
 * Dimension annotations, derived from the stadium model. The viewport draws them and the Rhino
 * export writes them to 90_DIMENSIONS, so both always show the same numbers.
 */
import { extents, type Stadium } from './stadium';

export type P3 = [number, number, number];
export interface Annotation { id: string; from: P3; to: P3; value: number; label: string; kind: 'dim' | 'level' }

export function annotations(s: Stadium): Annotation[] {
  const { field, ring, profiles, layout } = s;
  const W2 = field.width / 2, L2 = field.length / 2;
  const out: Annotation[] = [];
  // field
  out.push({ id: 'DIM.FIELD.LENGTH', kind: 'dim', from: [-L2, -W2 - 2500, 0], to: [L2, -W2 - 2500, 0], value: field.length, label: 'Field length' });
  out.push({ id: 'DIM.FIELD.WIDTH', kind: 'dim', from: [L2 + 2500, -W2, 0], to: [L2 + 2500, W2, 0], value: field.width, label: 'Field width' });
  // first-row distances on the stand centrelines (the far stand too when it differs)
  const yN = ring.cy + ring.hy, yS = ring.cy - ring.hy, xE = ring.cx + ring.hx, xW = ring.cx - ring.hx;
  out.push({ id: 'DIM.BOWL.SIDE_DISTANCE', kind: 'dim', from: [0, W2, 0], to: [0, yN, 0], value: ring.dist.N, label: 'Touchline to first row' });
  if (Math.abs(ring.dist.S - ring.dist.N) > 1) out.push({ id: 'DIM.BOWL.SIDE_DISTANCE_S', kind: 'dim', from: [0, -W2, 0], to: [0, yS, 0], value: ring.dist.S, label: 'Touchline to first row (south)' });
  out.push({ id: 'DIM.BOWL.END_DISTANCE', kind: 'dim', from: [L2, 0, 0], to: [xE, 0, 0], value: ring.dist.E, label: 'Goal line to first row' });
  if (Math.abs(ring.dist.W - ring.dist.E) > 1) out.push({ id: 'DIM.BOWL.END_DISTANCE_W', kind: 'dim', from: [-L2, 0, 0], to: [xW, 0, 0], value: ring.dist.W, label: 'Goal line to first row (west)' });
  // tier levels and depths on a sideline section (x = 0): the south stand, or the north one where the south does not carry the tier
  for (const t of profiles) {
    const south = layout.rows.S[t.index] > 0;
    const n = (south ? layout.rows.S : layout.rows.N)[t.index];
    if (n <= 0) continue;
    const sgn = south ? -1 : 1, y = south ? yS : yN;
    const back = t.rows[n - 1].d + t.rowDepth, top = t.rows[n - 1].z;
    const y0 = y + sgn * t.front, y1 = y + sgn * back;
    out.push({ id: `DIM.${t.id}.FIRST_ROW_LEVEL`, kind: 'level', from: [0, y0, 0], to: [0, y0, t.bottom], value: t.bottom, label: `${t.name} first row` });
    out.push({ id: `DIM.${t.id}.TOP_ROW_LEVEL`, kind: 'level', from: [0, y1, 0], to: [0, y1, top], value: top, label: `${t.name} top row` });
    out.push({ id: `DIM.${t.id}.DEPTH`, kind: 'dim', from: [0, y0, top + 1500], to: [0, y1, top + 1500], value: back - t.front, label: `${t.name} depth` });
  }
  // building levels (Round 03) on the same section, at the front of each floor plate
  const ySec = layout.rows.S.some((r) => r > 0) ? -1 : 1, yBase = ySec < 0 ? yS : yN;
  for (const l of s.building.levels) {
    const y = yBase + ySec * (l.d0 + 1500);
    out.push({ id: `DIM.LEVEL.${l.id}`, kind: 'level', from: [0, y, 0], to: [0, y, l.z], value: l.z, label: l.name });
  }
  // overall footprint
  const e = extents(ring, layout, profiles);
  out.push({ id: 'DIM.BOWL.LENGTH', kind: 'dim', from: [e.minX, e.minY - 6000, 0], to: [e.maxX, e.minY - 6000, 0], value: e.maxX - e.minX, label: 'Bowl length' });
  out.push({ id: 'DIM.BOWL.WIDTH', kind: 'dim', from: [e.maxX + 6000, e.minY, 0], to: [e.maxX + 6000, e.maxY, 0], value: e.maxY - e.minY, label: 'Bowl width' });
  return out;
}
