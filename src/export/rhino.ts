/**
 * Native Rhino .3dm export (McNeel rhino3dm / openNURBS; runs in the browser and in Node).
 *
 * Input is the resolved Stadium — the same model the viewport draws — so the file always matches
 * what the designer sees. Output:
 *   • millimetre model units; the local stadium frame (origin = field centre at field level, +X field length, +Z up)
 *   • the MANICAI layer standard (00_REFERENCE … 91_ANALYSIS) with tier/sector sub-layers
 *   • terraces as exact NURBS: each straight run is the tier section extruded along it, each corner the
 *     section revolved about the corner centre. The pieces of one tier share edges exactly and are grouped;
 *     run manicai_join_tiers.py (or _Join on the group) for one closed polysurface per tier
 *   • every seat in use as a named block instance (one block definition per seat width) carrying its id and C-value;
 *     club seats on 05_PREMIUM, wheelchair positions and companion seats on 04_ACCESSIBILITY, and the positions
 *     removed for vomitories / platforms as named points on 91_ANALYSIS::EXCLUDED_SEATS
 *   • vomitory openings as closed solids on 07_VERTICAL_CIRCULATION::VOMITORIES (the join script subtracts them)
 *   • Round 03 building: concourse and premium floor plates (closed meshes), suites, program zones and cores
 *     (closed solids) on 05_PREMIUM, 06_CONCOURSES and 07_VERTICAL_CIRCULATION, each named and carrying its area
 *   • field markings as true lines and arcs; goals as solids
 *   • the full project JSON in the document strings, so MANICAI can reopen the file parametrically
 */
import { annotations } from '../core/engine/annotations';
import { bandSolid, PROGRAM_KINDS, PROGRAM_LABEL, SLAB, type BoxMesh } from '../core/engine/building';
import { isCorner, pointAt, SECTORS, SECTOR_LABEL, SEGMENTS, type SegmentId } from '../core/engine/plan';
import { tierOutline } from '../core/engine/profile';
import { SEAT_STATUS, seatId } from '../core/engine/seats';
import { vomCorners } from '../core/engine/vomGeometry';
import type { Stadium } from '../core/engine/stadium';
import { serializeProject } from '../core/schema';

// rhino3dm's bundled .d.ts lags the WASM bindings, so the module is typed loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RhinoModule = any;

export const APP_VERSION = '0.3.0';

/** The MANICAI layer standard. Systems that are not generated yet keep their place in the hierarchy. */
export const LAYER_TREE: { name: string; color: [number, number, number]; children: string[] }[] = [
  { name: '00_REFERENCE', color: [150, 150, 150], children: ['ORIGIN', 'NORTH'] },
  { name: '01_FIELD', color: [90, 140, 80], children: ['SURFACE', 'MARKINGS', 'GOALS', 'ZONES'] },
  { name: '02_BOWL_GEOMETRY', color: [120, 120, 128], children: ['FRONT_ROW_LINE', 'ROW_LINES'] },
  { name: '03_SEATING', color: [70, 76, 90], children: [] },
  { name: '04_ACCESSIBILITY', color: [30, 96, 190], children: ['WHEELCHAIR_POSITIONS', 'COMPANION_SEATS'] },
  { name: '05_PREMIUM', color: [170, 130, 60], children: ['LEVELS', 'SUITES'] },
  { name: '06_CONCOURSES', color: [160, 150, 140], children: ['FLOOR_PLATES', 'PROGRAM', ...PROGRAM_KINDS.map((k) => `PROGRAM::${PROGRAM_LABEL[k].toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`)] },
  { name: '07_VERTICAL_CIRCULATION', color: [150, 110, 160], children: ['VOMITORIES', 'CORES'] },
  { name: '08_STRUCTURE', color: [110, 112, 118], children: [] },
  { name: '09_ROOF', color: [200, 200, 205], children: [] },
  { name: '10_FACADE', color: [180, 175, 165], children: [] },
  { name: '11_HVAC', color: [60, 150, 200], children: [] },
  { name: '12_ELECTRICAL', color: [230, 170, 30], children: [] },
  { name: '13_PLUMBING', color: [40, 120, 200], children: [] },
  { name: '14_LIGHTING', color: [240, 200, 60], children: [] },
  { name: '15_AV_IT', color: [0, 150, 170], children: [] },
  { name: '16_BACK_OF_HOUSE', color: [140, 140, 120], children: [] },
  { name: '17_SITE', color: [120, 150, 110], children: [] },
  { name: '90_DIMENSIONS', color: [10, 132, 255], children: [] },
  { name: '91_ANALYSIS', color: [230, 40, 40], children: ['SIGHTLINES', 'EXCLUDED_SEATS'] },
];

const free = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };
const rgba = ([r, g, b]: [number, number, number]) => ({ r, g, b, a: 255 });
const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export interface RhinoExportOptions {
  version?: 7 | 8;
  /** seats as block instances (default) or not at all */
  seats?: boolean;
}

export function exportRhino(rh: RhinoModule, s: Stadium, opts: RhinoExportOptions = {}): Uint8Array {
  const p = s.project;
  const doc = new rh.File3dm();
  doc.settings().modelUnitSystem = rh.UnitSystem.Millimeters;
  doc.settings().modelAbsoluteTolerance = 0.01;
  doc.applicationName = 'MANICAI';
  doc.applicationDetails = `MANICAI ${APP_VERSION} — generative stadium design engine`;

  // ── layers
  const layerIndex = new Map<string, number>();
  const layerId = new Map<string, string>();
  const addLayer = (path: string, color: [number, number, number]) => {
    if (layerIndex.has(path)) return layerIndex.get(path)!;
    const parts = path.split('::');
    const l = new rh.Layer();
    l.name = parts[parts.length - 1];
    l.color = rgba(color);
    if (parts.length > 1) l.parentLayerId = layerId.get(parts.slice(0, -1).join('::'));
    const i = doc.layers().add(l);
    free(l);
    layerIndex.set(path, i);
    layerId.set(path, doc.layers().get(i).id);
    return i;
  };
  for (const parent of LAYER_TREE) {
    addLayer(parent.name, parent.color);
    for (const c of parent.children) addLayer(`${parent.name}::${c}`, parent.color);
  }
  const tierLayer = (t: { id: string; name: string }) => `${t.id}_${slug(t.name)}`;
  for (const t of s.profiles) {
    addLayer(`02_BOWL_GEOMETRY::${tierLayer(t)}`, [120, 120, 128]);
    const club = p.tiers[t.index]?.kind === 'club';
    const root = club ? '05_PREMIUM' : '03_SEATING';
    const col: [number, number, number] = club ? [170, 130, 60] : [70, 76, 90];
    addLayer(`${root}::${tierLayer(t)}`, col);
    for (const sec of SECTORS) addLayer(`${root}::${tierLayer(t)}::${slug(SECTOR_LABEL[sec])}`, col);
  }
  const L = (path: string) => { const i = layerIndex.get(path); if (i === undefined) throw new Error(`Layer ${path} missing`); return i; };

  const attrs = (layer: string, name: string, user: Record<string, string | number> = {}) => {
    const a = new rh.ObjectAttributes();
    a.layerIndex = L(layer);
    a.name = name;
    for (const [k, v] of Object.entries(user)) a.setUserString(`manicai.${k}`, String(v));
    return a;
  };
  const add = (geom: any, a: any) => { doc.objects().add(geom, a); free(geom, a); };

  // ── reference
  add(new rh.LineCurve([0, 0, 0], [10000, 0, 0]), attrs('00_REFERENCE::ORIGIN', 'AXIS_X'));
  add(new rh.LineCurve([0, 0, 0], [0, 10000, 0]), attrs('00_REFERENCE::ORIGIN', 'AXIS_Y'));
  add(new rh.LineCurve([0, 0, 0], [0, 0, 10000]), attrs('00_REFERENCE::ORIGIN', 'AXIS_Z'));
  add(new rh.TextDot('ORIGIN 0,0,0 — centre of field, field level', [0, 0, 0]), attrs('00_REFERENCE::ORIGIN', 'ORIGIN'));
  {
    const a = (p.site.northDeg * Math.PI) / 180;
    const o: [number, number, number] = [s.bounds.min[0] - 20000, s.bounds.max[1], 0];
    add(new rh.LineCurve(o, [o[0] + Math.cos(a) * 15000, o[1] + Math.sin(a) * 15000, 0]), attrs('00_REFERENCE::NORTH', 'TRUE_NORTH', { northDeg: p.site.northDeg }));
    add(new rh.TextDot('N', [o[0] + Math.cos(a) * 17000, o[1] + Math.sin(a) * 17000, 0]), attrs('00_REFERENCE::NORTH', 'TRUE_NORTH.LABEL'));
  }

  // ── field
  const f = s.field;
  {
    const r = f.surface;
    const slab = rh.Extrusion.createBoxExtrusion(new rh.Box(new rh.BoundingBox([r.minX, r.minY, -50], [r.maxX, r.maxY, 0])), true);
    add(slab, attrs('01_FIELD::SURFACE', 'FIELD_SURFACE', { sport: f.sport, length_mm: f.length, width_mm: f.width }));
    for (const m of f.markings) {
      if (m.kind === 'line') add(new rh.LineCurve([m.a[0], m.a[1], 0], [m.b[0], m.b[1], 0]), attrs('01_FIELD::MARKINGS', m.id, { width_mm: m.width }));
      else if (m.kind === 'arc') add(arcCurve(rh, m.c[0], m.c[1], 0, m.r, m.a0, m.a1 - m.a0), attrs('01_FIELD::MARKINGS', m.id, { width_mm: m.width }));
      else add(arcCurve(rh, m.c[0], m.c[1], 0, m.r, 0, Math.PI * 2), attrs('01_FIELD::MARKINGS', m.id));
    }
    for (const z of f.zones) {
      const q = z.rect, pl = new rh.Polyline(0);
      for (const [x, y] of [[q.minX, q.minY], [q.maxX, q.minY], [q.maxX, q.maxY], [q.minX, q.maxY], [q.minX, q.minY]]) pl.add(x, y, 0);
      add(pl.toPolylineCurve(), attrs('01_FIELD::ZONES', z.id, { label: z.label }));
      free(pl);
    }
    for (const g of f.goals) {
      const post = (a: number[], b: number[], r: number, name: string) => add(tube(rh, a, b, r), attrs('01_FIELD::GOALS', name));
      const [A, B] = g.posts, x = A[0];
      post([x, A[1], g.crossbarZ], [x, B[1], g.crossbarZ], 60, `${g.id}.CROSSBAR`);
      if (g.kind === 'soccer') {
        post([A[0], A[1], 0], [A[0], A[1], g.crossbarZ], 60, `${g.id}.POST_1`);
        post([B[0], B[1], 0], [B[0], B[1], g.crossbarZ], 60, `${g.id}.POST_2`);
      } else {
        const sgn = Math.sign(x) || 1;
        post([x + sgn * g.depth, 0, 0], [x + sgn * g.depth, 0, g.crossbarZ - 600], 110, `${g.id}.STANDARD`);
        post([x + sgn * g.depth, 0, g.crossbarZ - 600], [x, 0, g.crossbarZ], 90, `${g.id}.GOOSENECK`);
        post([A[0], A[1], g.crossbarZ], [A[0], A[1], g.postTopZ], 50, `${g.id}.UPRIGHT_1`);
        post([B[0], B[1], g.crossbarZ], [B[0], B[1], g.postTopZ], 50, `${g.id}.UPRIGHT_2`);
      }
    }
  }

  // ── bowl geometry: front-row line, row nosing lines, terrace surfaces
  const ring = s.ring;
  // exact front-row line: straight lines + arcs
  for (const seg of SEGMENTS) {
    const g = segmentCurve(rh, ring, seg, 0, 0);
    if (g) add(g, attrs('02_BOWL_GEOMETRY::FRONT_ROW_LINE', `FRONT_ROW.${seg}`));
  }
  const regions = s.layout.rows;
  for (const t of s.profiles) {
    const tl = `02_BOWL_GEOMETRY::${tierLayer(t)}`;
    // terrace pieces: each region with its own number of rows
    const gIdx = doc.groups().count;
    const grp = new rh.Group(); grp.name = `TERRACE_${t.id}`; doc.groups().add(grp); free(grp);
    for (const seg of SEGMENTS) {
      const n = regions[seg][t.index];
      if (n <= 0) continue;
      const piece = terracePiece(rh, ring, seg, tierOutline(t, n));
      if (!piece) continue;
      const a = attrs(tl, `TERRACE.${t.id}.${seg}`, { tier: t.id, segment: seg, rows: n, rowDepth_mm: t.rowDepth });
      a.addToGroup(gIdx);
      add(piece, a);
    }
    // row nosing lines at tread level, exact (lines and arcs) per region, for setting out
    t.rows.forEach((r, i) => {
      for (const seg of SEGMENTS) {
        if (regions[seg][t.index] <= i) continue;
        const g = segmentCurve(rh, ring, seg, r.d, r.z);
        if (g) add(g, attrs('02_BOWL_GEOMETRY::ROW_LINES', `ROW.${t.id}.${String(i + 1).padStart(2, '0')}.${seg}`, { tier: t.id, row: i + 1, segment: seg, nosing_offset_mm: Math.round(r.d), tread_level_mm: Math.round(r.z), riser_mm: Math.round(r.riser) }));
      }
    });
  }
  // vomitory openings: closed solids, grouped per tier for the join script's boolean difference
  for (const v of s.seats.vomitories) {
    const c = vomCorners(ring, v);
    const m = new rh.Mesh();
    for (const q of c) m.vertices().add(q[0], q[1], q[2]);
    for (const [a, b, cc, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) m.faces().addQuadFace(a, b, cc, d);
    m.normals().computeNormals();
    const brep = rh.Brep.createFromMesh(m, true);
    free(m);
    const tid = s.profiles[v.tier].id;
    add(brep, attrs('07_VERTICAL_CIRCULATION::VOMITORIES', v.id, { tier: tid, section: v.section, width_mm: v.width, rows_removed: v.rowsRemoved, floor_mm: Math.round(v.zFloor) }));
  }

  // ── Round 03 building: floor plates (closed meshes), suites, program and cores (closed solids)
  const meshOf = (b: BoxMesh) => {
    const m = new rh.Mesh();
    for (let k = 0; k < b.positions.length; k += 3) m.vertices().add(b.positions[k], b.positions[k + 1], b.positions[k + 2]);
    for (let k = 0; k < b.index.length; k += 3) m.faces().addTriFace(b.index[k], b.index[k + 1], b.index[k + 2]);
    m.normals().computeNormals();
    m.compact();
    return m;
  };
  const solidOf = (b: BoxMesh) => { const m = meshOf(b); const brep = rh.Brep.createFromMesh(m, true); free(m); return brep; };
  const B = s.building;
  for (const l of B.levels) {
    const layer = l.kind === 'concourse' ? '06_CONCOURSES::FLOOR_PLATES' : '05_PREMIUM::LEVELS';
    add(meshOf(bandSolid(ring, 'ring', l.d0, l.d1, l.z - SLAB, l.z)), attrs(layer, l.id, { name: l.name, level_mm: Math.round(l.z), area_m2: Math.round(l.area), serves: l.serves }));
  }
  for (const st of B.suites) {
    const h = (p.premium.find((x) => `PREM.${x.id}` === st.level)?.height ?? 4500) - SLAB - 600;
    add(solidOf(bandSolid(ring, { seg: st.seg, u0: st.u0, u1: st.u1 }, st.d0, st.d1, st.z, st.z + h)), attrs('05_PREMIUM::SUITES', st.id, { seats: st.seats, level_mm: Math.round(st.z) }));
  }
  for (const z of B.program) {
    const layer = `06_CONCOURSES::PROGRAM::${PROGRAM_LABEL[z.kind].toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
    add(solidOf(bandSolid(ring, { seg: z.seg, u0: z.u0, u1: z.u1 }, z.d0 + 200, z.d1 - 200, z.z, z.z + 3200)), attrs(layer, z.id, { use: PROGRAM_LABEL[z.kind], area_m2: z.area.toFixed(1), level_mm: Math.round(z.z) }));
  }
  for (const c of B.cores) {
    add(solidOf(bandSolid(ring, { seg: c.seg, u0: c.u0, u1: c.u1 }, c.d0, c.d1, 0, c.zTop)), attrs('07_VERTICAL_CIRCULATION::CORES', c.id, { stairs: c.stairs, lifts: c.lifts, top_mm: Math.round(c.zTop) }));
  }

  // ── seats: one block per seat width, one named instance per position in use
  if (opts.seats !== false && s.seats.seats.count) {
    const t = s.seats.seats, tierIds = s.profiles.map((x) => x.id);
    const blocks = new Map<string, string>();
    const block = (name: string, desc: string, parts: any[], layer: string) => {
      if (blocks.has(name)) { free(...parts); return blocks.get(name)!; }
      const battrs = parts.map((_, i) => { const a = new rh.ObjectAttributes(); a.layerIndex = L(layer); a.name = `${name}.${i + 1}`; return a; });
      const idx = doc.instanceDefinitions().add(name, desc, '', '', [0, 0, 0], parts, battrs);
      free(...parts, ...battrs);
      const id = doc.instanceDefinitions().get(idx).id;
      blocks.set(name, id);
      return id;
    };
    const seatBlockFor = (w: number) => block(`MANICAI_SEAT_${w}MM`, `Generic stadium seat, ${w} mm centres (generic parametric family — not a manufacturer product)`, seatBlock(rh, w).parts, '03_SEATING');
    const wcBlock = () => block('MANICAI_WHEELCHAIR_1400x900MM', 'Wheelchair position, 1400 mm deep × 900 mm wide clear floor (generic)', [rh.Extrusion.createBoxExtrusion(new rh.Box(new rh.BoundingBox([-800, -450, 0], [600, 450, 40])), true)], '04_ACCESSIBILITY::WHEELCHAIR_POSITIONS');
    const seatLayers = s.profiles.map((pr) => {
      const root = p.tiers[pr.index]?.kind === 'club' ? '05_PREMIUM' : '03_SEATING';
      return SECTORS.map((sec) => L(`${root}::${tierLayer(pr)}::${slug(SECTOR_LABEL[sec])}`));
    });
    const widths = p.tiers.map((x) => x.seatWidth ?? p.seating.seatWidth);
    for (let i = 0; i < t.count; i++) {
      const name = seatId(t, i, tierIds);
      if (t.status[i] !== 0) {
        const a = attrs('91_ANALYSIS::EXCLUDED_SEATS', name, { reason: SEAT_STATUS[t.status[i]] });
        add(new rh.Point([t.x[i], t.y[i], t.z[i]]), a);
        continue;
      }
      const wheel = t.cls[i] === 2, comp = t.cls[i] === 3;
      const blockId = wheel ? wcBlock() : seatBlockFor(widths[t.tier[i]]);
      const xf = rh.Transform.multiply(rh.Transform.translationXYZ(t.x[i], t.y[i], t.z[i]), rh.Transform.rotation(t.rot[i], [0, 0, 1], [0, 0, 0]));
      const ref = new rh.InstanceReference(blockId, xf);
      const a = new rh.ObjectAttributes();
      a.layerIndex = wheel ? L('04_ACCESSIBILITY::WHEELCHAIR_POSITIONS') : comp ? L('04_ACCESSIBILITY::COMPANION_SEATS') : seatLayers[t.tier[i]][t.sector[i]];
      a.name = name;
      a.setUserString('manicai.cvalue_mm', String(Math.round(t.cValue[i])));
      if (wheel || comp) a.setUserString('manicai.class', wheel ? 'wheelchair' : 'companion');
      doc.objects().add(ref, a);
      free(ref, a, xf);
    }
  }

  // ── dimensions (lines + text dots; native Rhino dimensions follow in Round 06)
  for (const an of annotations(s)) {
    const a = attrs('90_DIMENSIONS', an.id, { value_mm: Math.round(an.value), label: an.label });
    add(new rh.LineCurve(an.from, an.to), a);
    const at = an.kind === 'level' ? an.to : [(an.from[0] + an.to[0]) / 2, (an.from[1] + an.to[1]) / 2, (an.from[2] + an.to[2]) / 2];
    add(new rh.TextDot(`${an.label}: ${(an.value / 1000).toFixed(3)} m`, at), attrs('90_DIMENSIONS', `${an.id}.LABEL`));
  }

  // ── analysis: sightlines on the north sideline centreline (x = 0) for every 4th row
  const focusY = f.width / 2;
  for (const t of s.profiles) {
    const n = s.layout.rows.N[t.index];
    t.rows.forEach((r, i) => {
      if (i >= n || (i % 4 && i !== n - 1)) return;
      const eye = [0, ring.cy + ring.hy + r.eyeD, r.eyeZ];
      add(new rh.LineCurve(eye, [0, focusY, 0]), attrs('91_ANALYSIS::SIGHTLINES', `SIGHTLINE.${t.id}.R${String(i + 1).padStart(2, '0')}`, { cvalue_side_mm: Math.round(r.cSide) }));
    });
  }

  // ── parametric preservation
  doc.strings().set('manicai.schema', 'manicai.project');
  doc.strings().set('manicai.appVersion', APP_VERSION);
  doc.strings().set('manicai.project', serializeProject(p));
  doc.strings().set('manicai.capacity', String(s.metrics.total));
  doc.strings().set('manicai.capacity.bowl_net', String(s.metrics.net));
  doc.strings().set('manicai.capacity.suites', String(s.metrics.suiteSeats));
  doc.strings().set('manicai.building.gfa_m2', String(Math.round(s.building.metrics.grossArea)));
  doc.strings().set('manicai.capacity.gross', String(s.metrics.gross));
  doc.strings().set('manicai.coordinateSystem', 'mm; Z up; origin = centre of the playing field at field level; +X field length (east end), +Y field width (north sideline); site north given by manicai.project site.northDeg');
  doc.strings().set('manicai.note', 'Editable Rhino model generated by MANICAI — a conceptual design, not a construction document. Seats are block instances named tier-section-row-seat. Terrace pieces of one tier are grouped; run manicai_join_tiers.py (Export menu) to join each tier into one closed polysurface and cut its vomitory openings. Reopen this file in MANICAI to edit parametrically.');

  const options = new rh.File3dmWriteOptions();
  options.version = opts.version ?? 8;
  const bytes = doc.toByteArrayOptions(options);
  free(options, doc);
  return bytes;
}

/** Straight segment: the section extruded along the run. Corner: the section revolved about the corner centre. */
function terracePiece(rh: RhinoModule, ring: Stadium['ring'], seg: SegmentId, outline: [number, number][]) {
  if (!isCorner(seg)) {
    const a = pointAt(ring, seg, 0, 0), b = pointAt(ring, seg, 1, 0);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) return null;
    // section drawn in world XY as (d, z) — counter-clockwise, so it extrudes along +Z — then placed:
    // X → outward normal, Y → up, Z → back along the run (a proper rotation; the run is CCW in plan)
    const pl = new rh.Polyline(0);
    for (const [d, z] of outline) pl.add(d, z, 0);
    pl.add(outline[0][0], outline[0][1], 0);
    const crv = pl.toPolylineCurve();
    const ext = rh.Extrusion.create(crv, len, false);
    free(pl, crv);
    const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len; // run direction a→b (the path tangent)
    const xf = new rh.Transform(1);
    xf.m00 = a.nx; xf.m01 = 0; xf.m02 = -dx; xf.m03 = b.x;
    xf.m10 = a.ny; xf.m11 = 0; xf.m12 = -dy; xf.m13 = b.y;
    xf.m20 = 0; xf.m21 = 1; xf.m22 = 0; xf.m23 = 0;
    ext.transform(xf);
    free(xf);
    return ext;
  }
  // corner: profile in the vertical plane through the corner centre at the start angle
  const s0 = pointAt(ring, seg, 0, 0);
  const cx = s0.x - s0.nx * ring.r, cy = s0.y - s0.ny * ring.r;
  const pl = new rh.Polyline(0);
  for (const [d, z] of outline) pl.add(cx + s0.nx * (ring.r + d), cy + s0.ny * (ring.r + d), z);
  pl.add(cx + s0.nx * (ring.r + outline[0][0]), cy + s0.ny * (ring.r + outline[0][0]), outline[0][1]);
  const crv = pl.toPolylineCurve();
  const axis = new rh.Line([cx, cy, 0], [cx, cy, 1000]);
  const rev = rh.RevSurface.create(crv, axis, 0, Math.PI / 2);
  free(pl, crv);
  return rev ?? null;
}

function segmentCurve(rh: RhinoModule, ring: Stadium['ring'], seg: SegmentId, d: number, z: number) {
  const a = pointAt(ring, seg, 0, d), b = pointAt(ring, seg, 1, d);
  if (!isCorner(seg)) return Math.hypot(b.x - a.x, b.y - a.y) < 1 ? null : new rh.LineCurve([a.x, a.y, z], [b.x, b.y, z]);
  const r = ring.r + d;
  if (r < 1) return null;
  return arcCurve(rh, a.x - a.nx * r, a.y - a.ny * r, z, r, Math.atan2(a.ny, a.nx), Math.PI / 2);
}

/** Exact (rational NURBS) circular arc, angles CCW from +X. */
function arcCurve(rh: RhinoModule, cx: number, cy: number, z: number, r: number, a0: number, sweep: number) {
  const c = new rh.Circle([cx, cy, z], r);
  if (sweep >= Math.PI * 2 - 1e-9) { const n = c.toNurbsCurve(); free(c); return n; }
  const arc = new rh.Arc(c, sweep);
  const n = arc.toNurbsCurve();
  free(c, arc);
  if (Math.abs(a0) > 1e-12) n.transform(rh.Transform.rotation(a0, [0, 0, 1], [cx, cy, z]));
  return n;
}

function tube(rh: RhinoModule, from: number[], to: number[], r: number) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const ext = rh.Extrusion.createCylinderExtrusion(new rh.Cylinder(new rh.Circle(r), len), true, true);
  const dir = [d[0] / len, d[1] / len, d[2] / len];
  if (Math.abs(dir[2] - 1) > 1e-9) {
    const xf = Math.abs(dir[2] + 1) < 1e-9 ? rh.Transform.rotation(Math.PI, [1, 0, 0], [0, 0, 0]) : rh.Transform.rotationVectors([0, 0, 1], dir, [0, 0, 0]);
    ext.transform(xf);
  }
  ext.translate(from);
  return ext;
}

/** Seat block: pedestal, pan and back as closed box solids; insertion point = pan centre at tread level, facing +X. */
function seatBlock(rh: RhinoModule, width: number) {
  const w = Math.max(380, width - 40);
  const boxes: [number[], number[]][] = [
    [[-180, -w * 0.25, 0], [-60, w * 0.25, 380]],
    [[-215, -w / 2, 385], [215, w / 2, 455]],
    [[-285, -w / 2, 425], [-215, w / 2, 855]],
  ];
  return { parts: boxes.map(([a, b]) => rh.Extrusion.createBoxExtrusion(new rh.Box(new rh.BoundingBox(a, b)), true)) };
}

/** Read a MANICAI project back out of a .3dm's document strings. */
export function projectFrom3dm(rh: RhinoModule, bytes: Uint8Array): string | null {
  const doc = rh.File3dm.fromByteArray(bytes);
  if (!doc) return null;
  let out: string | null = null;
  for (let i = 0; i < doc.strings().count; i++) {
    const kv = doc.strings().get(i) as [string, string];
    if (kv[0] === 'manicai.project') out = kv[1];
  }
  doc.delete();
  return out;
}
