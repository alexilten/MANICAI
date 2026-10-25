/**
 * Dimension annotations, derived from the stadium model. The viewport draws them and the Rhino
 * export writes them to 90_DIMENSIONS, so both always show the same numbers.
 */
import type { Stadium } from './stadium';

export type P3 = [number, number, number];
export interface Annotation { id: string; from: P3; to: P3; value: number; label: string; kind: 'dim' | 'level' }

export function annotations(s: Stadium): Annotation[] {
  const { field, ring, profiles } = s;
  const W2 = field.width / 2, L2 = field.length / 2;
  const out: Annotation[] = [];
  // field
  out.push({ id: 'DIM.FIELD.LENGTH', kind: 'dim', from: [-L2, -W2 - 2500, 0], to: [L2, -W2 - 2500, 0], value: field.length, label: 'Field length' });
  out.push({ id: 'DIM.FIELD.WIDTH', kind: 'dim', from: [L2 + 2500, -W2, 0], to: [L2 + 2500, W2, 0], value: field.width, label: 'Field width' });
  // first-row distances, measured on the north sideline and east end centrelines
  out.push({ id: 'DIM.BOWL.SIDE_DISTANCE', kind: 'dim', from: [0, W2, 0], to: [0, ring.hy, 0], value: ring.sideDistance, label: 'Touchline to first row' });
  out.push({ id: 'DIM.BOWL.END_DISTANCE', kind: 'dim', from: [L2, 0, 0], to: [ring.hx, 0, 0], value: ring.endDistance, label: 'Goal line to first row' });
  // tier levels and depths on the south sideline section (x = 0)
  for (const t of profiles) {
    const y0 = -(ring.hy + t.front), y1 = -(ring.hy + t.back);
    out.push({ id: `DIM.${t.id}.FIRST_ROW_LEVEL`, kind: 'level', from: [0, y0, 0], to: [0, y0, t.bottom], value: t.bottom, label: `${t.name} first row` });
    out.push({ id: `DIM.${t.id}.TOP_ROW_LEVEL`, kind: 'level', from: [0, y1, 0], to: [0, y1, t.top], value: t.top, label: `${t.name} top row` });
    out.push({ id: `DIM.${t.id}.DEPTH`, kind: 'dim', from: [0, y0, t.top + 1500], to: [0, y1, t.top + 1500], value: t.back - t.front, label: `${t.name} depth` });
  }
  // overall footprint
  const reach = Math.max(...profiles.map((t) => t.back));
  const X = ring.hx + reach, Y = ring.hy + reach;
  out.push({ id: 'DIM.BOWL.LENGTH', kind: 'dim', from: [-X, -Y - 6000, 0], to: [X, -Y - 6000, 0], value: 2 * X, label: 'Bowl length' });
  out.push({ id: 'DIM.BOWL.WIDTH', kind: 'dim', from: [X + 6000, -Y, 0], to: [X + 6000, Y, 0], value: 2 * Y, label: 'Bowl width' });
  return out;
}
