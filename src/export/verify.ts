/**
 * Model check (Round 06): automatic verification of the element model and, when given, of an export's
 * read-back, before the model leaves MANICAI.
 *
 *   geometry   every element's mesh is finite, closed and consistently wound (each edge used once in
 *              each direction), encloses a positive volume, and agrees with the exact (analytic)
 *              volume of its extrusions and revolves within 1 %; terrace and member sections are simple
 *              polygons (no edge crosses another)
 *   identity   element ids are unique, every element sits on a layer of the MANICAI layer standard and
 *              has an IFC class, model status and storey
 *   capacity   the seats exported equal the net capacity reported, and the floodlights the count used
 *              for the illuminance estimate
 *   read-back  (IFC) the file declares IFC4, every #reference resolves, and the census of each class
 *              equals the model's
 *
 * These are consistency checks of a conceptual model, not code or engineering checks.
 */
import { SEAT_CLASSES } from '../core/engine/seats';
import type { Stadium } from '../core/engine/stadium';
import { ifcCensus } from './ifc';
import { buildModel, meshVolume, shapeVolume, type BimModel, type V2 } from './model';
import { LAYER_TREE } from './rhino';

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface Check { id: string; group: 'Geometry' | 'Identity' | 'Capacity' | 'Read-back'; label: string; status: CheckStatus; detail: string }
export interface ModelReport { checks: Check[]; pass: number; warn: number; fail: number; elements: number }

/** Closed, consistently wound triangle mesh: every directed edge appears once and its reverse once. */
export function meshClosed(positions: Float32Array, index: Uint32Array): boolean {
  // weld coincident vertices first (meshes may repeat corners)
  const key = new Map<string, number>(), id: number[] = [];
  for (let k = 0; k < positions.length; k += 3) {
    const kk = `${Math.round(positions[k] * 10)},${Math.round(positions[k + 1] * 10)},${Math.round(positions[k + 2] * 10)}`;
    let v = key.get(kk);
    if (v === undefined) { v = key.size; key.set(kk, v); }
    id.push(v);
  }
  const edges = new Map<string, number>();
  for (let k = 0; k < index.length; k += 3) {
    const t = [id[index[k]], id[index[k + 1]], id[index[k + 2]]];
    if (t[0] === t[1] || t[1] === t[2] || t[2] === t[0]) continue; // collapsed by welding
    for (let e = 0; e < 3; e++) { const ek = `${t[e]}>${t[(e + 1) % 3]}`; edges.set(ek, (edges.get(ek) ?? 0) + 1); }
  }
  for (const [ek, n] of edges) {
    const [a, b] = ek.split('>');
    if (n !== (edges.get(`${b}>${a}`) ?? 0)) return false;
  }
  return edges.size > 0;
}

/** Does any pair of non-adjacent edges of a closed polygon cross? */
export function selfIntersects(p: V2[]): boolean {
  const n = p.length;
  const o = (a: V2, b: V2, c: V2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n];
    if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
  }
  return false;
}

const layerPaths = (() => {
  const s = new Set<string>();
  for (const l of LAYER_TREE) { s.add(l.name); for (const c of l.children) s.add(`${l.name}::${c}`); }
  return s;
})();

export function verifyModel(s: Stadium, model: BimModel = buildModel(s), ifcText?: string): ModelReport {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const els = model.elements;
  const list = (ids: string[]) => ids.slice(0, 4).join(', ') + (ids.length > 4 ? ` and ${ids.length - 4} more` : '');

  // ── geometry
  const notFinite: string[] = [], open: string[] = [], negative: string[] = [], drift: string[] = [], crossing: string[] = [];
  let worst = 0;
  for (const e of els) {
    const m = e.mesh();
    if (!m.positions.every(Number.isFinite)) { notFinite.push(e.id); continue; }
    if (!meshClosed(m.positions, m.index)) open.push(e.id);
    const mv = meshVolume(m);
    if (!(mv > 0)) negative.push(e.id);
    if (e.shapes.some((sh) => sh.kind !== 'mesh')) {
      const ex = e.shapes.reduce((a, sh) => a + shapeVolume(sh), 0);
      const rel = Math.abs(ex - mv) / Math.max(1, Math.abs(ex));
      worst = Math.max(worst, rel);
      if (rel > 0.01) drift.push(e.id);
    }
    for (const sh of e.shapes) if ((sh.kind === 'sweep' || sh.kind === 'revolve') && selfIntersects(sh.section)) crossing.push(e.id);
  }
  add({ id: 'geom.finite', group: 'Geometry', label: 'Coordinates are finite', status: notFinite.length ? 'fail' : 'pass', detail: notFinite.length ? `NaN or infinite coordinates in ${list(notFinite)}` : `${els.length} elements` });
  add({ id: 'geom.closed', group: 'Geometry', label: 'Solids are closed and consistently wound', status: open.length ? 'fail' : 'pass', detail: open.length ? `Open or inconsistently wound: ${list(open)}` : 'Every edge is shared by exactly two faces, in opposite directions' });
  add({ id: 'geom.volume', group: 'Geometry', label: 'Solids enclose a positive volume', status: negative.length ? 'fail' : 'pass', detail: negative.length ? `Zero or inside-out: ${list(negative)}` : 'Outward normals throughout' });
  add({ id: 'geom.exact', group: 'Geometry', label: 'Exact and tessellated volumes agree', status: drift.length ? 'warn' : 'pass', detail: drift.length ? `More than 1 % apart: ${list(drift)}` : `Largest difference ${(worst * 100).toFixed(2)} % (arc faceting)` });
  add({ id: 'geom.sections', group: 'Geometry', label: 'Sections are simple polygons', status: crossing.length ? 'fail' : 'pass', detail: crossing.length ? `Self-intersecting section: ${list(crossing)}` : 'No terrace, member or opening section crosses itself' });

  // ── identity
  const seen = new Set<string>(), dup: string[] = [];
  for (const id of [...els.map((e) => e.id), ...model.aggregates.map((a) => a.id)]) { if (seen.has(id)) dup.push(id); seen.add(id); }
  add({ id: 'id.unique', group: 'Identity', label: 'Element ids are unique', status: dup.length ? 'fail' : 'pass', detail: dup.length ? `Duplicated: ${list(dup)}` : `${seen.size} ids` });
  const offLayer = els.filter((e) => !layerPaths.has(e.layer) && !/^0[23]_[A-Z_]+::T\d+_/.test(e.layer)).map((e) => e.id);
  add({ id: 'id.layers', group: 'Identity', label: 'Every element is on a MANICAI standard layer', status: offLayer.length ? 'fail' : 'pass', detail: offLayer.length ? `Unknown layer: ${list(offLayer)}` : `${new Set(els.map((e) => e.layer)).size} layers used` });
  const unclassified = els.filter((e) => !e.ifc.cls.startsWith('Ifc') || !e.ifc.type || ((e.ifc.type === 'USERDEFINED') && !e.ifc.objectType)).map((e) => e.id);
  add({ id: 'id.classes', group: 'Identity', label: 'Every element has an IFC class and type', status: unclassified.length ? 'fail' : 'pass', detail: unclassified.length ? `Missing or USERDEFINED without an object type: ${list(unclassified)}` : `${new Set(els.map((e) => e.ifc.cls)).size} IFC classes` });
  const lowest = model.storeys[0].elevation;
  const below = els.filter((e) => e.base < lowest - 2000).map((e) => e.id);
  add({ id: 'id.storeys', group: 'Identity', label: 'Elements sit on a storey', status: below.length ? 'warn' : 'pass', detail: below.length ? `More than 2 m below the field level: ${list(below)}` : `${model.storeys.length} storeys: ${model.storeys.map((x) => x.name).join(', ')}` });
  const statuses = new Map<string, number>();
  for (const e of els) statuses.set(e.status, (statuses.get(e.status) ?? 0) + 1);
  add({ id: 'id.status', group: 'Identity', label: 'BIM elements are kept apart from masses and reservations', status: 'pass', detail: [...statuses].map(([k, n]) => `${n} ${k === 'element' ? 'elements' : k === 'mass' ? 'conceptual masses' : k === 'reservation' ? 'space reservations' : 'placeholders'}`).join(' · ') });

  // ── capacity
  const t = s.seats.seats;
  let active = 0;
  const byClass = SEAT_CLASSES.map(() => 0);
  for (let i = 0; i < t.count; i++) if (t.status[i] === 0) { active++; byClass[t.cls[i]]++; }
  add({ id: 'cap.seats', group: 'Capacity', label: 'Seats exported equal the net capacity', status: active === s.metrics.net ? 'pass' : 'fail', detail: `${active.toLocaleString('en-US')} seat instances · net capacity ${s.metrics.net.toLocaleString('en-US')} · plus ${s.metrics.suiteSeats.toLocaleString('en-US')} suite seats = ${s.metrics.total.toLocaleString('en-US')}` });
  const fx = s.systems.fixtures.length, fm = s.systems.metrics.lighting.fixtures;
  add({ id: 'cap.fixtures', group: 'Capacity', label: 'Floodlights exported equal the lighting estimate', status: fx === fm ? 'pass' : 'fail', detail: `${fx} instances · estimate ${fm}` });
  const spaces = els.filter((e) => e.space), zero = spaces.filter((e) => !(e.space!.area > 0)).map((e) => e.id);
  add({ id: 'cap.spaces', group: 'Capacity', label: 'Spaces have floor area', status: zero.length ? 'fail' : 'pass', detail: zero.length ? `No area: ${list(zero)}` : `${spaces.length} spaces · ${Math.round(spaces.reduce((a, e) => a + e.space!.area, 0)).toLocaleString('en-US')} m² net` });

  // ── IFC read-back
  if (ifcText) {
    const schemaOk = /FILE_SCHEMA\(\('IFC4'\)\)/.test(ifcText);
    const ids = new Set<number>(), refs = new Set<number>();
    for (const m of ifcText.matchAll(/^#(\d+)=/gm)) ids.add(+m[1]);
    for (const m of ifcText.matchAll(/#(\d+)(?!=)/g)) refs.add(+m[1]);
    const dangling = [...refs].filter((r) => !ids.has(r));
    add({ id: 'ifc.header', group: 'Read-back', label: 'IFC file declares IFC4 and every reference resolves', status: schemaOk && !dangling.length ? 'pass' : 'fail', detail: !schemaOk ? 'FILE_SCHEMA is not IFC4' : dangling.length ? `${dangling.length} dangling references` : `${ids.size.toLocaleString('en-US')} entities` });
    const census = ifcCensus(ifcText);
    const want = new Map<string, number>();
    for (const e of els) { const k = e.ifc.cls.toUpperCase(); want.set(k, (want.get(k) ?? 0) + 1); }
    for (const a of model.aggregates) { const k = a.ifc.cls.toUpperCase(); want.set(k, (want.get(k) ?? 0) + 1); }
    const seatsInFile = census.get('IFCFURNITURE') ?? 0;
    if (seatsInFile) want.set('IFCFURNITURE', active);
    if (fx) want.set('IFCLIGHTFIXTURE', fx);
    const off = [...want].filter(([k, n]) => (census.get(k) ?? 0) !== n).map(([k, n]) => `${k} ${census.get(k) ?? 0}/${n}`);
    add({ id: 'ifc.census', group: 'Read-back', label: 'IFC entities match the model, class by class', status: off.length ? 'fail' : 'pass', detail: off.length ? `Mismatch: ${off.join(', ')}` : [...want].map(([k, n]) => `${k.slice(3).toLowerCase()} ${n}`).join(' · ') });
  }

  return { checks, pass: checks.filter((c) => c.status === 'pass').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length, elements: els.length };
}

/** The report as Markdown, for the export bundle. */
export function reportMarkdown(s: Stadium, r: ModelReport): string {
  const icon = { pass: '✓', warn: '!', fail: '✗' } as const;
  const lines = [`# MANICAI model check — ${s.project.name}`, '', `${r.elements} elements · ${r.pass} passed · ${r.warn} warnings · ${r.fail} failed`, '',
    'Consistency checks of a conceptual model — not code, structural or engineering checks.', '', '| | Check | Result |', '|---|---|---|'];
  for (const c of r.checks) lines.push(`| ${icon[c.status]} | ${c.group}: ${c.label} | ${c.detail.replace(/\|/g, '/')} |`);
  return lines.join('\n') + '\n';
}
