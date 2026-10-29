/**
 * IFC 4 export (ISO 16739-1:2018, IFC4 ADD2 TC1), written as STEP physical file text with no
 * dependencies — runs in the browser and in Node.
 *
 * Semantic, not mesh transfer (brief §13):
 *   • spatial structure Project → Site → Building → Storeys (field level and each building level);
 *     elements are contained in the storey of their base, spaces aggregated into it;
 *   • every element is classified (IfcSlab, IfcBeam, IfcColumn, IfcMember, IfcPlate, IfcSpace,
 *     IfcAudioVisualAppliance, IfcBuildingElementProxy PROVISIONFORSPACE …), the roof and facade are
 *     IfcRoof / IfcCurtainWall aggregates of their parts, and vomitories are IfcOpeningElements that
 *     void their terrace;
 *   • ids: the Manica id is the Tag and the MANICA_Common.ManicaId; the GlobalId is derived from it
 *     deterministically, so re-exporting the same project keeps every GlobalId;
 *   • MANICA_Common carries layer, schedule category and model status — generic parametric element,
 *     conceptual mass, space reservation or generic placeholder — and the element's key values;
 *     base quantities (NetVolume, NetFloorArea) come from the exact geometry;
 *   • exact geometry: plan extrusions bounded by lines and true arcs (IfcIndexedPolyCurve with
 *     IfcArcIndex), terraces as section extrusions and corner revolves, members as section
 *     extrusions; triangulated face sets only for the sloped roof deck, the cap and the vomitories;
 *   • seats and floodlights are typed instances (IfcFurnitureType CHAIR, IfcLightFixtureType
 *     DIRECTIONSOURCE) sharing one mapped representation per type.
 *
 * Units: millimetres, square metres, cubic metres, radians. Local frame as everywhere in Manica:
 * origin at the centre of the field at field level, +Z up; true north from the project's site.
 */
import type { Stadium } from '../core/engine/stadium';
import { SEAT_CLASSES } from '../core/engine/seats';
import { seatId } from '../core/engine/seats';
import { buildModel, cross, normalize, shapeVolume, STATUS_LABEL, storeyOf, type BimElement, type BimModel, type Loop, type Shape, type Storey, type V2, type V3 } from './model';
import { LAYER_TREE } from './rhino';

export const IFC_APP_VERSION = '0.6.0';

export interface IfcOptions {
  /** seats as typed furniture instances (default true) */
  seats?: boolean;
  /** file timestamp (default now) */
  timestamp?: Date;
  /** reuse a model already built from this stadium */
  model?: BimModel;
}

// ── STEP encoding ────────────────────────────────────────────────────────────────────────

/** A real: always with a decimal point, never in JS exponent form. */
export function real(x: number, dp = 3): string {
  if (!Number.isFinite(x)) throw new Error(`IFC: non-finite number ${x}`);
  const r = Math.round(x * 10 ** dp) / 10 ** dp;
  if (r === 0) return '0.';
  let s = String(r);
  if (s.includes('e')) s = r.toFixed(dp);
  return s.includes('.') ? s : `${s}.`;
}

/** A STEP string: quotes doubled, backslashes escaped, anything beyond ASCII as \X2\ UTF-16 hex. */
export function str(s: string | undefined | null): string {
  if (s == null) return '$';
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === '\\') out += '\\\\';
    else if (c >= 0x20 && c < 0x7f) out += ch;
    else {
      const units = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c];
      out += `\\X2\\${units.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join('')}\\X0\\`;
    }
  }
  return `'${out}'`;
}

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** 128-bit hash (cyrb128) of a string, as four unsigned 32-bit words. */
function hash128(s: string): number[] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044559);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044559);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** The IFC 22-character GlobalId of a 128-bit value: 2 bits, then 21 × 6 bits. */
export function ifcGuid(key: string): string {
  const w = hash128(key);
  const bit = (i: number) => (w[i >> 5] >>> (31 - (i & 31))) & 1;
  const take = (from: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | bit(from + i); return v; };
  let out = B64[take(0, 2)];
  for (let k = 0; k < 21; k++) out += B64[take(2 + k * 6, 6)];
  return out;
}

class Step {
  readonly lines: string[] = [];
  private n = 0;
  private cache = new Map<string, string>();
  add(e: string): string { const id = `#${++this.n}`; this.lines.push(`${id}=${e};`); return id; }
  /** an entity shared by identical text */
  once(e: string): string { let id = this.cache.get(e); if (!id) { id = this.add(e); this.cache.set(e, id); } return id; }
  get count() { return this.n; }
}

const enumv = (s: string) => `.${s}.`;

// ── writer ───────────────────────────────────────────────────────────────────────────────

export function exportIfc(s: Stadium, opts: IfcOptions = {}): string {
  const p = s.project;
  const model = opts.model ?? buildModel(s);
  const W = new Step();
  const used = new Set<string>();
  const guid = (id: string) => {
    let g = ifcGuid(`manica:${p.name}:${id}`), k = 1;
    while (used.has(g)) g = ifcGuid(`manica:${p.name}:${id}#${k++}`);
    used.add(g);
    return str(g);
  };

  const pt3 = (x: number, y: number, z: number) => W.once(`IFCCARTESIANPOINT((${real(x)},${real(y)},${real(z)}))`);
  const dir3 = (v: V3) => W.once(`IFCDIRECTION((${real(v[0], 9)},${real(v[1], 9)},${real(v[2], 9)}))`);
  const dir2 = (v: V2) => W.once(`IFCDIRECTION((${real(v[0], 9)},${real(v[1], 9)}))`);
  const ax3 = (o: V3, z?: V3, x?: V3) => W.add(`IFCAXIS2PLACEMENT3D(${pt3(...o)},${z ? dir3(z) : '$'},${x ? dir3(x) : '$'})`);
  const Z: V3 = [0, 0, 1];

  // ── project, units, contexts
  const origin = W.once(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, 0)},$,$)`);
  const na = (p.site.northDeg * Math.PI) / 180;
  const ctx = W.add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-02,${origin},${dir2([Math.cos(na), Math.sin(na)])})`);
  const body = W.add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const units = W.add(`IFCUNITASSIGNMENT((${[
    W.add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'), W.add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    W.add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'), W.add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ].join(',')}))`);
  const project = W.add(`IFCPROJECT(${guid('PROJECT')},$,${str(p.name)},${str('Generated by Manica — a conceptual design, not a construction document')},$,${str(p.name)},'Concept',(${ctx}),${units})`);

  // ── spatial structure
  const dms = (deg: number) => {
    const sg = deg < 0 ? -1 : 1, a = Math.abs(deg), d = Math.floor(a), m = Math.floor((a - d) * 60), sec = Math.floor(((a - d) * 60 - m) * 60);
    const mil = Math.round(((((a - d) * 60 - m) * 60) - sec) * 1e6);
    return `(${[d, m, sec, mil].map((v) => sg * v).join(',')})`;
  };
  const sitePl = W.add(`IFCLOCALPLACEMENT($,${origin})`);
  const site = W.add(`IFCSITE(${guid('SITE')},$,'Site',$,$,${sitePl},$,$,.ELEMENT.,${p.site.latitude != null ? dms(p.site.latitude) : '$'},${p.site.longitude != null ? dms(p.site.longitude) : '$'},${p.site.elevationM != null ? real(p.site.elevationM * 1000) : '$'},$,$)`);
  const bldPl = W.add(`IFCLOCALPLACEMENT(${sitePl},${origin})`);
  const building = W.add(`IFCBUILDING(${guid('BUILDING')},$,${str(p.name)},${str('Stadium (conceptual)')},$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
  W.add(`IFCRELAGGREGATES(${guid('REL.PROJECT')},$,$,$,${project},(${site}))`);
  W.add(`IFCRELAGGREGATES(${guid('REL.SITE')},$,$,$,${site},(${building}))`);
  const storeyIds = new Map<string, { ent: string; pl: string; world: string; storey: Storey }>();
  for (const st of model.storeys) {
    const pl = W.add(`IFCLOCALPLACEMENT(${bldPl},${ax3([0, 0, st.elevation])})`);
    const ent = W.add(`IFCBUILDINGSTOREY(${guid(`STOREY.${st.id}`)},$,${str(st.name)},$,$,${pl},$,$,.ELEMENT.,${real(st.elevation)})`);
    // a placement on the storey that puts element coordinates back in the stadium frame
    const world = W.add(`IFCLOCALPLACEMENT(${pl},${ax3([0, 0, -st.elevation])})`);
    storeyIds.set(st.id, { ent, pl, world, storey: st });
  }
  W.add(`IFCRELAGGREGATES(${guid('REL.BUILDING')},$,$,$,${building},(${[...storeyIds.values()].map((x) => x.ent).join(',')}))`);
  const contained = new Map<string, string[]>(), spaces = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

  // ── presentation: a surface style per top-level layer, layer assignments per Manica layer
  const styleOf = new Map<string, string>();
  const surfaceStyle = (layer: string) => {
    const top = layer.split('::')[0];
    let st = styleOf.get(top);
    if (!st) {
      const c = LAYER_TREE.find((l) => l.name === top)?.color ?? [180, 180, 180];
      const tr = top === '10_FACADE' ? 0.35 : ['11_HVAC', '12_ELECTRICAL', '13_PLUMBING', '17_SITE'].includes(top) ? 0.5 : 0;
      const colour = W.add(`IFCCOLOURRGB($,${real(c[0] / 255, 4)},${real(c[1] / 255, 4)},${real(c[2] / 255, 4)})`);
      st = W.add(`IFCSURFACESTYLE(${str(top)},.BOTH.,(${W.add(`IFCSURFACESTYLESHADING(${colour},${real(tr, 2)})`)}))`);
      styleOf.set(top, st);
    }
    return st;
  };
  const layerReps = new Map<string, string[]>();

  // ── geometry
  const indexedCurve = (l: Loop) => {
    const coords: V2[] = [], segs: string[] = [];
    const at: number[] = [];
    l.pts.forEach((q, i) => { at[i] = coords.push(q); if (l.mids[i]) coords.push(l.mids[i]!); });
    l.pts.forEach((_, i) => {
      const a = at[i], b = at[(i + 1) % l.pts.length];
      segs.push(l.mids[i] ? `IFCARCINDEX((${a},${a + 1},${b}))` : `IFCLINEINDEX((${a},${b}))`);
    });
    const pl = W.add(`IFCCARTESIANPOINTLIST2D((${coords.map(([x, y]) => `(${real(x)},${real(y)})`).join(',')}))`);
    return W.add(`IFCINDEXEDPOLYCURVE(${pl},(${segs.join(',')}),.F.)`);
  };
  const polyCurve = (pts: V2[]) => {
    const pl = W.add(`IFCCARTESIANPOINTLIST2D((${pts.map(([x, y]) => `(${real(x)},${real(y)})`).join(',')}))`);
    return W.add(`IFCINDEXEDPOLYCURVE(${pl},(IFCLINEINDEX((${[...pts.map((_, i) => i + 1), 1].join(',')}))),.F.)`);
  };
  const closedProfile = (pts: V2[]) => W.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyCurve(pts)})`);

  const solid = (sh: Shape): { item: string; type: string } => {
    switch (sh.kind) {
      case 'plan': {
        const outer = indexedCurve(sh.outer);
        const prof = sh.holes.length ? W.add(`IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,${outer},(${sh.holes.map(indexedCurve).join(',')}))`) : W.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${outer})`);
        return { item: W.add(`IFCEXTRUDEDAREASOLID(${prof},${ax3([0, 0, sh.z0])},${dir3(Z)},${real(sh.z1 - sh.z0)})`), type: 'SweptSolid' };
      }
      case 'sweep': {
        // local X along x, Y up, Z back along -dir from the far end: a right-handed frame
        const o: V3 = [sh.origin[0] + sh.dir[0] * sh.depth, sh.origin[1] + sh.dir[1] * sh.depth, sh.origin[2]];
        return { item: W.add(`IFCEXTRUDEDAREASOLID(${closedProfile(sh.section)},${ax3(o, [-sh.dir[0], -sh.dir[1], 0], [sh.x[0], sh.x[1], 0])},${dir3(Z)},${real(sh.depth)})`), type: 'SweptSolid' };
      }
      case 'revolve': {
        // local X along x, Y up (so Z = X × Y): the section is (radius, z); revolving about local +Y is counter-clockwise from above
        const pos = ax3(sh.centre, [sh.x[1], -sh.x[0], 0], [sh.x[0], sh.x[1], 0]);
        const axis = W.once(`IFCAXIS1PLACEMENT(${pt3(0, 0, 0)},${dir3([0, 1, 0])})`);
        return { item: W.add(`IFCREVOLVEDAREASOLID(${closedProfile(sh.section)},${pos},${axis},${real(sh.angle, 9)})`), type: 'SweptSolid' };
      }
      case 'box': {
        const [x0, y0, z0] = sh.min, [x1, y1, z1] = sh.max;
        const prof = W.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${real(x1 - x0)},${real(y1 - y0)})`);
        return { item: W.add(`IFCEXTRUDEDAREASOLID(${prof},${ax3([(x0 + x1) / 2, (y0 + y1) / 2, z0])},${dir3(Z)},${real(z1 - z0)})`), type: 'SweptSolid' };
      }
      case 'tube': {
        const d: V3 = [sh.to[0] - sh.from[0], sh.to[1] - sh.from[1], sh.to[2] - sh.from[2]];
        const w = normalize(d), u = normalize(cross(Math.abs(w[2]) < 0.9 ? Z : [1, 0, 0], w));
        const prof = W.once(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${real(sh.r)})`);
        return { item: W.add(`IFCEXTRUDEDAREASOLID(${prof},${ax3(sh.from, w, u)},${dir3(Z)},${real(Math.hypot(...d))})`), type: 'SweptSolid' };
      }
      case 'mesh': {
        const P = sh.mesh.positions, I = sh.mesh.index;
        const pts: string[] = [];
        for (let k = 0; k < P.length; k += 3) pts.push(`(${real(P[k], 1)},${real(P[k + 1], 1)},${real(P[k + 2], 1)})`);
        const tri: string[] = [];
        for (let k = 0; k < I.length; k += 3) tri.push(`(${I[k] + 1},${I[k + 1] + 1},${I[k + 2] + 1})`);
        const cl = W.add(`IFCCARTESIANPOINTLIST3D((${pts.join(',')}))`);
        return { item: W.add(`IFCTRIANGULATEDFACESET(${cl},$,.T.,(${tri.join(',')}),$)`), type: 'Tessellation' };
      }
    }
  };

  const shapeOf = (e: { shapes: Shape[]; layer: string }) => {
    const items = e.shapes.map(solid);
    const st = surfaceStyle(e.layer);
    for (const it of items) W.add(`IFCSTYLEDITEM(${it.item},(${st}),$)`);
    const rep = W.add(`IFCSHAPEREPRESENTATION(${body},'Body',${str(items[0].type)},(${items.map((i) => i.item).join(',')}))`);
    push(layerReps, e.layer, rep);
    return W.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`);
  };

  // ── properties
  const value = (v: string | number | boolean) => typeof v === 'boolean' ? `IFCBOOLEAN(${v ? '.T.' : '.F.'})` : typeof v === 'number' ? (Number.isInteger(v) ? `IFCINTEGER(${v})` : `IFCREAL(${real(v, 4)})`) : `IFCLABEL(${str(v)})`;
  const prop = (name: string, v: string | number | boolean) => W.once(`IFCPROPERTYSINGLEVALUE(${str(name)},$,${value(v)},$)`);
  const pset = (owner: string, key: string, name: string, props: Record<string, string | number | boolean>) => {
    const ps = Object.entries(props).filter(([, v]) => v !== '' && v != null);
    if (!ps.length) return;
    const set = W.add(`IFCPROPERTYSET(${guid(`${key}.${name}`)},$,${str(name)},$,(${ps.map(([k, v]) => prop(k, v)).join(',')}))`);
    W.add(`IFCRELDEFINESBYPROPERTIES(${guid(`${key}.${name}.REL`)},$,$,$,(${owner}),${set})`);
  };
  const BASE_QTO = new Set(['IfcSlab', 'IfcBeam', 'IfcColumn', 'IfcMember', 'IfcPlate']);
  const qto = (owner: string, key: string, name: string, qs: string[]) => {
    const q = W.add(`IFCELEMENTQUANTITY(${guid(`${key}.${name}`)},$,${str(name)},$,${str('Manica exact geometry (modelled envelope)')},(${qs.join(',')}))`);
    W.add(`IFCRELDEFINESBYPROPERTIES(${guid(`${key}.${name}.REL`)},$,$,$,(${owner}),${q})`);
  };

  // ── aggregates (roof, facade)
  const aggEnt = new Map<string, string>(), aggParts = new Map<string, string[]>();
  for (const a of model.aggregates) {
    const st = storeyOf(model.storeys, a.base), S = storeyIds.get(st.id)!;
    const ent = W.add(`${a.ifc.cls.toUpperCase()}(${guid(a.id)},$,${str(a.name)},${str(STATUS_LABEL[a.status])},${str(a.ifc.objectType)},${S.world},$,${str(a.id)},${enumv(a.ifc.type)})`);
    aggEnt.set(a.id, ent);
    push(contained, st.id, ent);
    pset(ent, a.id, 'MANICA_Common', { ManicaId: a.id, Layer: a.layer, ModelStatus: STATUS_LABEL[a.status], ...a.props });
  }

  // ── elements
  const entOf = new Map<string, { ent: string; pl: string }>();
  const openings: BimElement[] = [];
  for (const e of model.elements) {
    if (e.voids) { openings.push(e); continue; }
    const st = storeyOf(model.storeys, e.base), S = storeyIds.get(st.id)!;
    const pds = shapeOf(e);
    const cls = e.ifc.cls.toUpperCase();
    const ent = e.ifc.cls === 'IfcSpace'
      ? W.add(`IFCSPACE(${guid(e.id)},$,${str(e.id)},${str(STATUS_LABEL[e.status])},${str(e.ifc.objectType)},${S.world},${pds},${str(e.name)},.ELEMENT.,${enumv(e.ifc.type)},$)`)
      : W.add(`${cls}(${guid(e.id)},$,${str(e.name)},${str(STATUS_LABEL[e.status])},${str(e.ifc.objectType)},${S.world},${pds},${str(e.id)},${enumv(e.ifc.type)})`);
    entOf.set(e.id, { ent, pl: S.world });
    if (e.parent && aggEnt.has(e.parent)) push(aggParts, e.parent, ent);
    else if (e.ifc.cls === 'IfcSpace') push(spaces, st.id, ent);
    else push(contained, st.id, ent);
    pset(ent, e.id, 'MANICA_Common', { ManicaId: e.id, Layer: e.layer, Category: e.category, ModelStatus: STATUS_LABEL[e.status], ...e.props });
    const vol = e.shapes.reduce((a, sh) => a + shapeVolume(sh), 0) / 1e9;
    if (e.space) {
      pset(ent, e.id, 'Pset_SpaceCommon', { IsExternal: e.space.external });
      qto(ent, e.id, 'Qto_SpaceBaseQuantities', [
        W.add(`IFCQUANTITYAREA('NetFloorArea',$,$,${real(e.space.area, 3)},$)`),
        W.add(`IFCQUANTITYLENGTH('Height',$,$,${real(e.space.height)},$)`),
        W.add(`IFCQUANTITYVOLUME('NetVolume',$,$,${real(vol, 3)},$)`),
      ]);
    } else {
      qto(ent, e.id, BASE_QTO.has(e.ifc.cls) ? `Qto_${e.ifc.cls.slice(3)}BaseQuantities` : 'MANICA_Quantities', [W.add(`IFCQUANTITYVOLUME('NetVolume',$,$,${real(vol, 4)},$)`)]);
    }
  }
  for (const o of openings) {
    const host = entOf.get(o.voids!);
    if (!host) continue;
    const pds = shapeOf(o);
    const ent = W.add(`IFCOPENINGELEMENT(${guid(o.id)},$,${str(o.name)},$,${str(o.ifc.objectType)},${W.add(`IFCLOCALPLACEMENT(${host.pl},${origin})`)},${pds},${str(o.id)},.OPENING.)`);
    W.add(`IFCRELVOIDSELEMENT(${guid(`${o.id}.VOIDS`)},$,$,$,${host.ent},${ent})`);
    pset(ent, o.id, 'MANICA_Common', { ManicaId: o.id, Layer: o.layer, ...o.props });
  }
  for (const [id, parts] of aggParts) W.add(`IFCRELAGGREGATES(${guid(`${id}.PARTS`)},$,$,$,${aggEnt.get(id)},(${parts.join(',')}))`);

  // ── typed instances: one mapped representation per type
  const typeShape = (key: string, items: string[], layer: string) => {
    const st = surfaceStyle(layer);
    for (const it of items) W.add(`IFCSTYLEDITEM(${it},(${st}),$)`);
    const rep = W.add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${items.join(',')}))`);
    push(layerReps, layer, rep);
    const map = W.add(`IFCREPRESENTATIONMAP(${origin},${rep})`);
    const item = W.add(`IFCMAPPEDITEM(${map},${W.once(`IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,${pt3(0, 0, 0)},$,$)`)})`);
    const mapped = W.add(`IFCSHAPEREPRESENTATION(${body},'Body','MappedRepresentation',(${item}))`);
    return { map, pds: W.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${mapped}))`), key };
  };
  const boxItem = (min: V3, max: V3) => solid({ kind: 'box', min, max }).item;
  /** placement in a storey, facing local +X along `xdir` (or, with `zdir`, any frame) */
  const place = (S: { pl: string; storey: Storey }, at: V3, xdir?: V3, zdir?: V3) => {
    const pt = W.add(`IFCCARTESIANPOINT((${real(at[0], 1)},${real(at[1], 1)},${real(at[2] - S.storey.elevation, 1)}))`);
    return W.add(`IFCLOCALPLACEMENT(${S.pl},${W.add(`IFCAXIS2PLACEMENT3D(${pt},${zdir ? dir3(zdir) : '$'},${xdir ? dir3(xdir) : '$'})`)})`);
  };

  // floodlights
  const SYS = s.systems;
  if (SYS.fixtures.length) {
    const lp = p.systems.lighting;
    const T = typeShape('FLOODLIGHT', [boxItem([-350, -350, -225], [350, 350, 225])], '14_LIGHTING::FLOODLIGHTS');
    // a type's property sets hang off the type itself (HasPropertySets), not a defines-by-properties relation
    const assumptions = { LuminousFluxAssumedLm: lp.lumens, PowerAssumedW: lp.watts, MaintenanceFactor: lp.maintenance, UtilisationFactor: lp.utilisation, Basis: 'Lumen method estimate (Manica); not a lighting design' };
    const typeSet = W.add(`IFCPROPERTYSET(${guid('TYPE.FLOODLIGHT.MANICA_LightingAssumptions')},$,'MANICA_LightingAssumptions',$,(${Object.entries(assumptions).map(([k, v]) => prop(k, v)).join(',')}))`);
    const typ = W.add(`IFCLIGHTFIXTURETYPE(${guid('TYPE.FLOODLIGHT')},$,'Manica generic LED floodlight',${str(`Generic proxy 700 × 700 × 450 mm aimed along local −Z. Not a manufacturer product; ${lp.lumens} lm and ${lp.watts} W are design assumptions.`)},$,(${typeSet}),(${T.map}),$,'Generic floodlight',.DIRECTIONSOURCE.)`);
    const inst: string[] = [];
    for (const fx of SYS.fixtures) {
      const st = storeyOf(model.storeys, fx.at[2]), S = storeyIds.get(st.id)!;
      const aim = normalize([fx.aim[0] - fx.at[0], fx.aim[1] - fx.at[1], fx.aim[2] - fx.at[2]]);
      const z: V3 = [-aim[0], -aim[1], -aim[2]];
      const x = normalize(cross(Math.abs(z[2]) < 0.99 ? Z : [0, 1, 0], z));
      const ent = W.add(`IFCLIGHTFIXTURE(${guid(fx.id)},$,${str(fx.id)},'Generic placeholder (not a manufacturer product)','Floodlight',${place(S, fx.at, x, z)},${T.pds},${str(fx.id)},.DIRECTIONSOURCE.)`);
      inst.push(ent);
      push(contained, st.id, ent);
      pset(ent, fx.id, 'MANICA_Common', { ManicaId: fx.id, Layer: '14_LIGHTING::FLOODLIGHTS', Category: 'Systems: Lighting', ModelStatus: STATUS_LABEL.placeholder, Mount: fx.mount, TiltDeg: +fx.tilt.toFixed(1), AimPoint: fx.aim.map(Math.round).join(',') });
    }
    W.add(`IFCRELDEFINESBYTYPE(${guid('TYPE.FLOODLIGHT.REL')},$,$,$,(${inst.join(',')}),${typ})`);
  }

  // seats
  let seatCount = 0;
  if (opts.seats !== false && s.seats.seats.count) {
    const t = s.seats.seats, tierIds = s.profiles.map((x) => x.id);
    const widths = p.tiers.map((x) => x.seatWidth ?? p.seating.seatWidth);
    const types = new Map<string, { typ: string; pds: string; inst: string[] }>();
    const typeFor = (key: string, name: string, desc: string, items: () => string[], layer: string, predefined: string, elementType: string) => {
      let T = types.get(key);
      if (!T) {
        const sh = typeShape(key, items(), layer);
        const typ = W.add(`IFCFURNITURETYPE(${guid(`TYPE.${key}`)},$,${str(name)},${str(desc)},$,$,(${sh.map}),$,${str(elementType)},.NOTDEFINED.,${enumv(predefined)})`);
        T = { typ, pds: sh.pds, inst: [] };
        types.set(key, T);
      }
      return T;
    };
    const seatItems = (width: number) => () => {
      const w = Math.max(380, width - 40);
      return [boxItem([-180, -w * 0.25, 0], [-60, w * 0.25, 380]), boxItem([-215, -w / 2, 385], [215, w / 2, 455]), boxItem([-285, -w / 2, 425], [-215, w / 2, 855])];
    };
    const OBJ = ['General admission seat', 'Club / premium seat', 'Wheelchair position', 'Companion seat'];
    const dirCache = new Map<number, string>();
    for (let i = 0; i < t.count; i++) {
      if (t.status[i] !== 0) continue;
      const wheel = SEAT_CLASSES[t.cls[i]] === 'wheelchair';
      const T = wheel
        ? typeFor('WHEELCHAIR', 'Manica wheelchair position 1400 × 900 mm', 'Clear floor space for a wheelchair user (generic)', () => [boxItem([-800, -450, 0], [600, 450, 40])], '04_ACCESSIBILITY::WHEELCHAIR_POSITIONS', 'USERDEFINED', 'Wheelchair position')
        : typeFor(`SEAT_${widths[t.tier[i]]}`, `Manica generic stadium seat ${widths[t.tier[i]]} mm`, `Generic stadium seat at ${widths[t.tier[i]]} mm centres (generic parametric family — not a manufacturer product)`, seatItems(widths[t.tier[i]]), '03_SEATING', 'CHAIR', 'Generic stadium seat');
      const st = storeyOf(model.storeys, t.z[i]), S = storeyIds.get(st.id)!;
      const key = Math.round(t.rot[i] * 1e4);
      let d = dirCache.get(key);
      if (!d) { d = dir3([Math.cos(key / 1e4), Math.sin(key / 1e4), 0]); dirCache.set(key, d); }
      const name = seatId(t, i, tierIds);
      const pt = W.add(`IFCCARTESIANPOINT((${real(t.x[i], 1)},${real(t.y[i], 1)},${real(t.z[i] - st.elevation, 1)}))`);
      const pl = W.add(`IFCLOCALPLACEMENT(${S.pl},${W.add(`IFCAXIS2PLACEMENT3D(${pt},${dir3(Z)},${d})`)})`);
      const ent = W.add(`IFCFURNITURE(${guid(`SEAT.${name}`)},$,${str(name)},${str(`C-value ${Math.round(t.cValue[i])} mm`)},${str(OBJ[t.cls[i]])},${pl},${T.pds},${str(name)},${wheel ? '.USERDEFINED.' : '.CHAIR.'})`);
      T.inst.push(ent);
      push(contained, st.id, ent);
      seatCount++;
    }
    for (const [key, T] of types) W.add(`IFCRELDEFINESBYTYPE(${guid(`TYPE.${key}.REL`)},$,$,$,(${T.inst.join(',')}),${T.typ})`);
  }

  // ── relationships
  for (const [sid, els] of contained) W.add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid(`REL.CONTAINS.${sid}`)},$,$,$,(${els.join(',')}),${storeyIds.get(sid)!.ent})`);
  for (const [sid, sp] of spaces) W.add(`IFCRELAGGREGATES(${guid(`REL.SPACES.${sid}`)},$,$,$,${storeyIds.get(sid)!.ent},(${sp.join(',')}))`);
  for (const [layer, reps] of layerReps) W.add(`IFCPRESENTATIONLAYERASSIGNMENT(${str(layer)},$,(${reps.join(',')}),$)`);

  // ── project-level record: the parametric project for round trips, and headline metrics
  pset(project, 'PROJECT', 'MANICA_Project', {
    AppVersion: IFC_APP_VERSION, Capacity: s.metrics.total, BowlNet: s.metrics.net, SuiteSeats: s.metrics.suiteSeats, SeatsExported: seatCount,
    GrossFloorAreaM2: Math.round(s.architecture.metrics.grossArea), RoofType: p.architecture.roof.type,
    CoordinateSystem: 'mm; Z up; origin = centre of the playing field at field level; +X field length; true north from the site',
    Note: 'Conceptual design generated by Manica — not a construction document. Not code-compliant or structurally certified without qualified review.',
  });

  const ts = (opts.timestamp ?? new Date()).toISOString().slice(0, 19);
  const header = [
    'ISO-10303-21;', 'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');",
    `FILE_NAME(${str(`${p.name}.ifc`)},'${ts}',(''),(''),${str(`Manica ${IFC_APP_VERSION}`)},${str(`Manica ${IFC_APP_VERSION}`)},'');`,
    "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
  ];
  return [...header, ...W.lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
}

/** Count entities by type in IFC text (a light read-back for the model check). */
export function ifcCensus(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /^#\d+=(IFC[A-Z0-9]+)\(/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.set(m[1], (out.get(m[1]) ?? 0) + 1);
  return out;
}
