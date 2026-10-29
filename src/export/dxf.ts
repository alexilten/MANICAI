/**
 * DXF export (Round 06): a general-arrangement plan and a cross-section, as AutoCAD R12 ASCII DXF —
 * the most widely read flavour (AutoCAD, BricsCAD, Revit and Rhino import, QGIS, LibreCAD).
 *
 *   plan     field and markings, the front-row and row lines (true arcs), seats as block inserts, the
 *            structural grid, columns, the outlines of every plan element (floor plates, suites,
 *            program, cores, back of house, MEP reservations, facade, roof edges) as closed polylines
 *            with arc bulges, floodlights with aiming lines
 *   section  A–A across the sidelines at a structural frame: terraces, floor plates, rakers, columns and
 *            roof frame on that frame, the roof and facade lines, field level, level marks, sightlines
 *
 * Units are millimetres (stated in the title; R12 has no units header). Layers follow the Manica layer
 * standard, shortened to the R12 limit of 31 characters (e.g. 06_PROGRAM_TOILETS).
 */
import { roofTopAt, ROOF_SKIN } from '../core/engine/architecture';
import { SLAB } from '../core/engine/building';
import { isCorner, pointAt, SEGMENTS } from '../core/engine/plan';
import { tierOutline } from '../core/engine/profile';
import { seatId, SEAT_CLASSES } from '../core/engine/seats';
import type { Stadium } from '../core/engine/stadium';
import { arcSweep, buildModel, pieceLoop, ringLoop, type BimModel, type Loop, type V2 } from './model';
import { LAYER_TREE } from './rhino';

export interface DxfOptions { seats?: boolean; model?: BimModel }

/** AutoCAD colour index per top-level layer */
const ACI: Record<string, number> = {
  '00': 8, '01': 3, '02': 8, '03': 250, '04': 5, '05': 40, '06': 9, '07': 6, '08': 8, '09': 254, '10': 252,
  '11': 4, '12': 30, '13': 150, '14': 2, '15': 130, '16': 33, '17': 82, '90': 5, '91': 1, '95': 7,
};

/** R12-safe layer name for a Manica layer path: the two-digit code and the child path, ≤ 31 chars. */
export function dxfLayer(path: string): string {
  const parts = path.split('::');
  const code = parts[0].slice(0, 2);
  const tail = parts.length > 1 ? parts.slice(1).join('_') : parts[0].slice(3);
  return `${code}_${tail}`.toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 31);
}

class Dxf {
  ents: string[] = [];
  layers = new Map<string, number>();
  min: V2 = [Infinity, Infinity];
  max: V2 = [-Infinity, -Infinity];
  private g(code: number, v: string | number) { this.ents.push(String(code), typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v); }
  private grow(...pts: V2[]) { for (const [x, y] of pts) { this.min = [Math.min(this.min[0], x), Math.min(this.min[1], y)]; this.max = [Math.max(this.max[0], x), Math.max(this.max[1], y)]; } }
  layer(path: string) {
    const name = path.startsWith('95_') ? path : dxfLayer(path);
    if (!this.layers.has(name)) this.layers.set(name, ACI[name.slice(0, 2)] ?? 7);
    return name;
  }
  line(layer: string, a: V2, b: V2) { this.g(0, 'LINE'); this.g(8, this.layer(layer)); this.g(10, a[0]); this.g(20, a[1]); this.g(30, 0); this.g(11, b[0]); this.g(21, b[1]); this.g(31, 0); this.grow(a, b); }
  arc(layer: string, c: V2, r: number, a0deg: number, a1deg: number) { this.g(0, 'ARC'); this.g(8, this.layer(layer)); this.g(10, c[0]); this.g(20, c[1]); this.g(30, 0); this.g(40, r); this.g(50, a0deg); this.g(51, a1deg); this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]); }
  circle(layer: string, c: V2, r: number) { this.g(0, 'CIRCLE'); this.g(8, this.layer(layer)); this.g(10, c[0]); this.g(20, c[1]); this.g(30, 0); this.g(40, r); this.grow([c[0] - r, c[1] - r], [c[0] + r, c[1] + r]); }
  text(layer: string, at: V2, h: number, s: string, rotDeg = 0, centre = false) {
    this.g(0, 'TEXT'); this.g(8, this.layer(layer)); this.g(10, at[0]); this.g(20, at[1]); this.g(30, 0); this.g(40, h); this.g(1, s.replace(/[^\x20-\x7e]/g, (c) => ({ '–': '-', '—': '-', '’': "'", '×': 'x', '°': '%%d', '·': '-' }[c] ?? '?')));
    if (rotDeg) this.g(50, rotDeg);
    if (centre) { this.g(72, 1); this.g(11, at[0]); this.g(21, at[1]); this.g(31, 0); }
    this.grow(at);
  }
  /** polyline through points with bulges (bulge i applies to the edge from point i to i+1) */
  poly(layer: string, pts: V2[], bulges: number[] = [], closed = true) {
    if (pts.length < 2) return;
    this.g(0, 'POLYLINE'); this.g(8, this.layer(layer)); this.g(66, 1); this.g(10, 0); this.g(20, 0); this.g(30, 0); this.g(70, closed ? 1 : 0);
    pts.forEach((p, i) => { this.g(0, 'VERTEX'); this.g(8, this.layer(layer)); this.g(10, p[0]); this.g(20, p[1]); this.g(30, 0); if (bulges[i]) this.g(42, bulges[i]); });
    this.g(0, 'SEQEND'); this.g(8, this.layer(layer));
    this.grow(...pts);
  }
  loop(layer: string, l: Loop) {
    const bulges = l.pts.map((p, i) => { const m = l.mids[i]; if (!m) return 0; const a = arcSweep(p, m, l.pts[(i + 1) % l.pts.length]); return a ? Math.tan(a.sweep / 4) : 0; });
    this.poly(layer, l.pts, bulges, true);
  }
  insert(layer: string, block: string, at: V2, rotDeg: number) { this.g(0, 'INSERT'); this.g(8, this.layer(layer)); this.g(2, block); this.g(10, at[0]); this.g(20, at[1]); this.g(30, 0); if (rotDeg) this.g(50, rotDeg); this.grow(at); }
  point(layer: string, at: V2) { this.g(0, 'POINT'); this.g(8, this.layer(layer)); this.g(10, at[0]); this.g(20, at[1]); this.g(30, 0); this.grow(at); }
}

export function exportDxf(s: Stadium, opts: DxfOptions = {}): string {
  const model = opts.model ?? buildModel(s);
  const p = s.project, ring = s.ring, f = s.field, AR = s.architecture;
  const D = new Dxf();
  const R2D = 180 / Math.PI;

  // ── PLAN
  D.poly('01_FIELD::SURFACE', [[f.surface.minX, f.surface.minY], [f.surface.maxX, f.surface.minY], [f.surface.maxX, f.surface.maxY], [f.surface.minX, f.surface.maxY]]);
  for (const m of f.markings) {
    if (m.kind === 'line') D.line('01_FIELD::MARKINGS', m.a, m.b);
    else if (m.kind === 'arc') { if (m.a1 - m.a0 >= Math.PI * 2 - 1e-9) D.circle('01_FIELD::MARKINGS', m.c, m.r); else D.arc('01_FIELD::MARKINGS', m.c, m.r, m.a0 * R2D, m.a1 * R2D); }
    else D.circle('01_FIELD::MARKINGS', m.c, m.r);
  }
  D.loop('02_BOWL_GEOMETRY::FRONT_ROW_LINE', ringLoop(ring, 0));
  // row nosing lines per region, as lines and arcs
  const segLine = (layer: string, seg: (typeof SEGMENTS)[number], d: number) => {
    const a = pointAt(ring, seg, 0, d), b = pointAt(ring, seg, 1, d);
    if (!isCorner(seg)) { if (Math.hypot(b.x - a.x, b.y - a.y) > 1) D.line(layer, [a.x, a.y], [b.x, b.y]); return; }
    const r = ring.r + d;
    if (r < 1) return;
    const a0 = Math.atan2(a.ny, a.nx) * R2D;
    D.arc(layer, [a.x - a.nx * r, a.y - a.ny * r], r, a0, a0 + 90);
  };
  for (const t of s.profiles) t.rows.forEach((r, i) => { for (const seg of SEGMENTS) if (s.layout.rows[seg][t.index] > i) segLine('02_BOWL_GEOMETRY::ROW_LINES', seg, r.d); });
  // tier backs
  for (const t of s.profiles) for (const seg of SEGMENTS) { const n = s.layout.rows[seg][t.index]; if (n > 0) segLine(`02_BOWL_GEOMETRY::TIER_EDGES`, seg, t.rows[n - 1].d + t.rowDepth); }

  // structural grid
  {
    const d0 = Math.min(...AR.rings.map((r) => r.d)) - 4000, d1 = AR.facade.d + 9000;
    const every = AR.frames.length > 60 ? 4 : AR.frames.length > 30 ? 2 : 1;
    AR.frames.forEach((fr, i) => {
      const a = pointAt(ring, fr.seg, fr.u, d0), b = pointAt(ring, fr.seg, fr.u, d1);
      D.line('08_STRUCTURE::GRID', [a.x, a.y], [b.x, b.y]);
      if (i % every === 0) { const q = pointAt(ring, fr.seg, fr.u, d1 + 3500); D.circle('08_STRUCTURE::GRID', [q.x, q.y], 1800); D.text('08_STRUCTURE::GRID', [q.x, q.y], 1400, String(i + 1), 0, true); }
    });
    for (const rl of AR.rings) D.loop('08_STRUCTURE::GRID', ringLoop(ring, rl.d));
  }

  // plan elements: outlines of plan shapes; member and opening footprints
  const PLAN_SKIP = new Set(['IfcCovering']);
  for (const e of model.elements) {
    if (PLAN_SKIP.has(e.ifc.cls)) continue;
    for (const sh of e.shapes) {
      if (sh.kind === 'plan') { D.loop(e.layer, sh.outer); for (const h of sh.holes) D.loop(e.layer, h); }
      else if (sh.kind === 'sweep' && !e.id.startsWith('TERRACE')) {
        // footprint: the section's plan extent across the member's width
        const ds = sh.section.map((q) => q[0]), a = Math.min(...ds), b = Math.max(...ds);
        const at = (d: number, w: number): V2 => [sh.origin[0] + sh.x[0] * d + sh.dir[0] * w, sh.origin[1] + sh.x[1] * d + sh.dir[1] * w];
        D.poly(e.layer, [at(a, 0), at(b, 0), at(b, sh.depth), at(a, sh.depth)]);
      } else if (sh.kind === 'box') D.poly(e.layer, [[sh.min[0], sh.min[1]], [sh.max[0], sh.min[1]], [sh.max[0], sh.max[1]], [sh.min[0], sh.max[1]]]);
      else if (sh.kind === 'tube') D.line(e.layer, [sh.from[0], sh.from[1]], [sh.to[0], sh.to[1]]);
    }
  }
  // roof edges (the deck and cap are tessellated in the model; in plan they are offset lines of the bowl)
  const r = AR.roof;
  for (const sp of r.spans) {
    if (sp === 'ring') { D.loop('09_ROOF::DECK', ringLoop(ring, r.dIn)); D.loop('09_ROOF::DECK', ringLoop(ring, r.dOut)); }
    else D.loop('09_ROOF::DECK', pieceLoop(ring, sp.seg, sp.u0, sp.u1, r.dIn, r.dOut));
  }
  // floodlights and aiming
  for (const fx of s.systems.fixtures) { D.circle('14_LIGHTING::FLOODLIGHTS', [fx.at[0], fx.at[1]], 350); D.line('14_LIGHTING::AIMING', [fx.at[0], fx.at[1]], [fx.aim[0], fx.aim[1]]); }

  // seats: one block per width, inserted at each seat in use
  const blocks: string[] = [];
  const block = (name: string, rects: [number, number, number, number][], layer: string) => {
    const L = D.layer(layer);
    const b = ['0', 'BLOCK', '8', '0', '2', name, '70', '0', '10', '0.0', '20', '0.0', '30', '0.0', '3', name];
    for (const [x0, y0, x1, y1] of rects) {
      b.push('0', 'POLYLINE', '8', L, '66', '1', '10', '0.0', '20', '0.0', '30', '0.0', '70', '1');
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) b.push('0', 'VERTEX', '8', L, '10', String(x), '20', String(y), '30', '0.0');
      b.push('0', 'SEQEND', '8', L);
    }
    b.push('0', 'ENDBLK', '8', '0');
    blocks.push(...b);
  };
  const t = s.seats.seats;
  if (opts.seats !== false && t.count) {
    const widths = p.tiers.map((x) => x.seatWidth ?? p.seating.seatWidth);
    for (const w of new Set(widths)) { const ww = Math.max(380, w - 40); block(`SEAT_${w}`, [[-215, -ww / 2, 215, ww / 2], [-285, -ww / 2, -215, ww / 2]], '03_SEATING'); }
    block('WHEELCHAIR_1400X900', [[-800, -450, 600, 450]], '04_ACCESSIBILITY::WHEELCHAIR_POSITIONS');
    const tierIds = s.profiles.map((x) => x.id);
    for (let i = 0; i < t.count; i++) {
      if (t.status[i] !== 0) continue;
      const wheel = SEAT_CLASSES[t.cls[i]] === 'wheelchair';
      D.insert(wheel ? '04_ACCESSIBILITY::WHEELCHAIR_POSITIONS' : SEAT_CLASSES[t.cls[i]] === 'premium' ? '05_PREMIUM::SEATS' : '03_SEATING', wheel ? 'WHEELCHAIR_1400X900' : `SEAT_${widths[t.tier[i]]}`, [t.x[i], t.y[i]], t.rot[i] * R2D);
    }
    void tierIds; void seatId;
  }
  const planMin = [...D.min] as V2, planMax = [...D.max] as V2;
  D.text('95_TITLE', [planMin[0], planMax[1] + 12000], 5000, `Manica - ${p.name} - GENERAL ARRANGEMENT PLAN - units mm - origin at the centre of the field`);
  D.text('95_TITLE', [planMin[0], planMax[1] + 5000], 2500, 'Conceptual design generated by Manica - not a construction document');

  // ── SECTION A–A across the sidelines, at the north-stand frame nearest x = 0
  const nFrames = AR.frames.filter((fr) => fr.seg === 'N');
  const cut = nFrames.length ? nFrames.reduce((a, b) => (Math.abs(pointAt(ring, b.seg, b.u, 0).x) < Math.abs(pointAt(ring, a.seg, a.u, 0).x) ? b : a)) : null;
  const xCut = cut ? pointAt(ring, 'N', cut.u, 0).x : 0;
  const sFrame = AR.frames.filter((fr) => fr.seg === 'S').reduce<typeof AR.frames[number] | null>((a, b) => (!a || Math.abs(pointAt(ring, b.seg, b.u, 0).x - xCut) < Math.abs(pointAt(ring, a.seg, a.u, 0).x - xCut) ? b : a), null);
  const zTop = Math.max(AR.metrics.roofTop, AR.metrics.facadeTop, ...s.profiles.map((x) => x.top));
  const oy = planMin[1] - 60000 - zTop; // section origin (field level) below the plan
  const yN = ring.cy + ring.hy, yS = ring.cy - ring.hy;
  // section coordinates: X = world y, Y = oy + z
  const N = (d: number, z: number): V2 => [yN + d, oy + z], S = (d: number, z: number): V2 => [yS - d, oy + z];
  const sides: { seg: 'N' | 'S'; at: typeof N; frame: typeof cut }[] = [{ seg: 'N', at: N, frame: cut }, { seg: 'S', at: S, frame: sFrame }];
  const extent = AR.facade.d + 20000;
  D.line('95_SECTION_FIELD', S(extent, 0), N(extent, 0));
  for (const { seg, at, frame } of sides) {
    for (const tp of s.profiles) {
      const n = s.layout.rows[seg][tp.index];
      if (n <= 0) continue;
      D.poly('02_BOWL_GEOMETRY::SECTION', tierOutline(tp, n).map(([d, z]) => at(d, z)));
      // sightlines from every 8th row's eye to the touchline
      tp.rows.forEach((row, i) => { if (i < n && (i % 8 === 0 || i === n - 1)) D.line('91_ANALYSIS::SIGHTLINES', at(row.eyeD, row.eyeZ), at(-(seg === 'N' ? yN - f.width / 2 : -yS - f.width / 2), 0)); });
    }
    for (const l of s.building.levels) D.poly(l.kind === 'concourse' ? '06_CONCOURSES::FLOOR_PLATES' : '05_PREMIUM::LEVELS', [at(l.d0, l.z - SLAB), at(l.d1, l.z - SLAB), at(l.d1, l.z), at(l.d0, l.z)]);
    if (frame) for (const m of AR.members) if (m.frame === frame.id && m.seg === seg) D.poly(m.kind === 'column' ? '08_STRUCTURE::COLUMNS' : m.kind === 'raker' ? '08_STRUCTURE::RAKERS' : '09_ROOF::PRIMARY_FRAMES', m.section.map(([d, z]) => at(d, z)));
    const covered = r.spans.some((sp) => sp === 'ring' || sp.seg === seg);
    if (covered) D.poly('09_ROOF::DECK', [at(r.dIn, roofTopAt(r, r.dIn) - ROOF_SKIN), at(r.dOut, roofTopAt(r, r.dOut) - ROOF_SKIN), at(r.dOut, roofTopAt(r, r.dOut)), at(r.dIn, roofTopAt(r, r.dIn))]);
    const ft = AR.facade.top[seg];
    if (ft) D.poly('10_FACADE::SKIN', [at(AR.facade.d, 0), at(AR.facade.d + 200, 0), at(AR.facade.d + 200, ft), at(AR.facade.d, ft)]);
  }
  if (r.cap) D.line('09_ROOF::CAP', N(r.dIn, r.cap.z), S(r.dIn, r.cap.z));
  // level marks at the north end of the section
  const marks = [...new Set([0, ...s.building.levels.map((l) => Math.round(l.z)), Math.round(AR.metrics.roofTop)])].sort((a, b) => a - b);
  let lastY = -Infinity;
  for (const z of marks) {
    const x = yN + extent, y = Math.max(oy + z, lastY + 2600);
    lastY = y;
    D.line('90_DIMENSIONS', [x - 3000, oy + z], [x, y]);
    D.text('90_DIMENSIONS', [x + 600, y - 600], 1500, `${z >= 0 ? '+' : ''}${(z / 1000).toFixed(3)}`);
  }
  D.text('95_TITLE', [yS - extent, oy + zTop + 9000], 4000, `SECTION A-A - across the sidelines at x = ${(xCut / 1000).toFixed(3)} m${cut ? ` (grid ${AR.frames.indexOf(cut) + 1})` : ''} - looking west - units mm`);

  // ── file
  const out: string[] = [];
  const g = (code: number, v: string | number) => out.push(String(code), String(v));
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSBASE'); g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
  g(9, '$EXTMIN'); g(10, D.min[0].toFixed(1)); g(20, D.min[1].toFixed(1)); g(30, '0.0');
  g(9, '$EXTMAX'); g(10, D.max[0].toFixed(1)); g(20, D.max[1].toFixed(1)); g(30, '0.0');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, '0.0');
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, D.layers.size + 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
  for (const [name, col] of [...D.layers].sort(([a], [b]) => a.localeCompare(b))) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, col); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
  g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, '0.0'); g(41, '1.0'); g(50, '0.0'); g(71, 0); g(42, '2.5'); g(3, 'txt'); g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  out.push('0', 'SECTION', '2', 'BLOCKS', ...blocks, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  // the entity list runs to millions of lines: joined on its own rather than spread
  return [out.join('\r\n'), D.ents.join('\r\n'), ['0', 'ENDSEC', '0', 'EOF'].join('\r\n')].join('\r\n') + '\r\n';
}

/** every Manica layer path, for documentation of the DXF layer names */
export const DXF_LAYERS = LAYER_TREE.flatMap((l) => [l.name, ...l.children.map((c) => `${l.name}::${c}`)]).map((path) => ({ path, dxf: dxfLayer(path) }));
