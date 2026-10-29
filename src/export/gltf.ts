/**
 * glTF 2.0 binary (.glb) export (Round 06), for visualisation tools, game engines and web viewers.
 *
 *   • metres, +Y up (glTF convention): stadium (x, y, z) mm → (x, z, −y) / 1000
 *   • a node per element, named by its Manica id, with its IFC class, category, layer, model status and
 *     key values in `extras`; nodes are grouped under one parent per top-level Manica layer
 *   • one material per top-level layer, coloured as in the Rhino layer standard
 *   • seats as GPU instances of one generic seat per tier (EXT_mesh_gpu_instancing, supported by three.js,
 *     Babylon.js, Blender and most web viewers; listed as used, not required)
 *   • floodlights merged into one mesh
 *   • no normals are written: glTF viewers compute flat normals, which suits the faceted solids
 *
 * A visual model: it carries the ids but not the full BIM structure — use the IFC for that.
 */
import type { Stadium } from '../core/engine/stadium';
import type { BoxMesh } from '../core/engine/building';
import { boxSolid } from '../core/engine/architecture';
import { buildModel, cross, mergeMeshes, normalize, STATUS_LABEL, type BimModel, type V3 } from './model';
import { LAYER_TREE } from './rhino';

export interface GltfOptions { seats?: boolean; model?: BimModel }

/* eslint-disable @typescript-eslint/no-explicit-any */
export function exportGlb(s: Stadium, opts: GltfOptions = {}): Uint8Array {
  const model = opts.model ?? buildModel(s);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: any[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = [], materials: any[] = [];
  const view = (data: ArrayBufferView, target?: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); byteLength += pad; }
    chunks.push(bytes);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const accessor = (data: Float32Array | Uint32Array, type: 'VEC3' | 'VEC4' | 'SCALAR', target?: number, minmax = false) => {
    const comps = type === 'VEC3' ? 3 : type === 'VEC4' ? 4 : 1;
    const a: any = { bufferView: view(data, target), componentType: data instanceof Float32Array ? 5126 : 5125, count: data.length / comps, type };
    if (minmax) {
      const mn = Array(comps).fill(Infinity), mx = Array(comps).fill(-Infinity);
      for (let k = 0; k < data.length; k++) { const j = k % comps; mn[j] = Math.min(mn[j], data[k]); mx[j] = Math.max(mx[j], data[k]); }
      a.min = mn; a.max = mx;
    }
    accessors.push(a);
    return accessors.length - 1;
  };
  /** stadium mm → glTF metres, Y up */
  const toGl = (P: Float32Array) => {
    const out = new Float32Array(P.length);
    for (let k = 0; k < P.length; k += 3) { out[k] = P[k] / 1000; out[k + 1] = P[k + 2] / 1000; out[k + 2] = -P[k + 1] / 1000; }
    return out;
  };
  const matOf = new Map<string, number>();
  const material = (layer: string) => {
    const top = layer.split('::')[0];
    let m = matOf.get(top);
    if (m === undefined) {
      const c = LAYER_TREE.find((l) => l.name === top)?.color ?? [180, 180, 180];
      const alpha = top === '10_FACADE' ? 0.55 : ['11_HVAC', '12_ELECTRICAL', '13_PLUMBING', '17_SITE'].includes(top) ? 0.6 : 1;
      materials.push({ name: top, pbrMetallicRoughness: { baseColorFactor: [...c.map((v) => (v / 255) ** 2.2), alpha], metallicFactor: 0, roughnessFactor: 0.85 }, ...(alpha < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}) });
      m = materials.length - 1;
      matOf.set(top, m);
    }
    return m;
  };
  const meshOf = (name: string, m: BoxMesh, layer: string) => {
    meshes.push({ name, primitives: [{ attributes: { POSITION: accessor(toGl(m.positions), 'VEC3', 34962, true) }, indices: accessor(m.index, 'SCALAR', 34963), material: material(layer) }] });
    return meshes.length - 1;
  };

  const groups = new Map<string, number[]>();
  const inGroup = (layer: string, node: number) => { const top = layer.split('::')[0]; const g = groups.get(top); if (g) g.push(node); else groups.set(top, [node]); };
  for (const e of model.elements) {
    if (e.voids) continue;
    nodes.push({ name: e.id, mesh: meshOf(e.id, e.mesh(), e.layer), extras: { manicaId: e.id, name: e.name, ifcClass: e.ifc.cls, ifcType: e.ifc.objectType ?? e.ifc.type, category: e.category, layer: e.layer, status: STATUS_LABEL[e.status], ...e.props } });
    inGroup(e.layer, nodes.length - 1);
  }

  // floodlights: one merged mesh, each box turned to its aim
  const fx = s.systems.fixtures;
  if (fx.length) {
    const unit = boxSolid([-350, -350, -225], [350, 350, 225]);
    const parts = fx.map((f) => {
      const z: V3 = normalize([f.at[0] - f.aim[0], f.at[1] - f.aim[1], f.at[2] - f.aim[2]]); // local +Z points away from the aim
      const x = normalize(cross(Math.abs(z[2]) < 0.99 ? [0, 0, 1] : [0, 1, 0], z)), y = cross(z, x);
      const P = new Float32Array(unit.positions.length);
      for (let k = 0; k < P.length; k += 3) for (let j = 0; j < 3; j++) P[k + j] = f.at[j] + x[j] * unit.positions[k] + y[j] * unit.positions[k + 1] + z[j] * unit.positions[k + 2];
      return { positions: P, index: unit.index.slice() };
    });
    nodes.push({ name: 'LGT.FLOODLIGHTS', mesh: meshOf('LGT.FLOODLIGHTS', mergeMeshes(parts), '14_LIGHTING::FLOODLIGHTS'), extras: { count: fx.length, status: STATUS_LABEL.placeholder, lumensAssumed: s.project.systems.lighting.lumens, wattsAssumed: s.project.systems.lighting.watts } });
    inGroup('14_LIGHTING', nodes.length - 1);
  }

  // seats: GPU instances per tier (generic seat: pan and back)
  const extensionsUsed: string[] = [];
  const t = s.seats.seats;
  if (opts.seats !== false && t.count) {
    extensionsUsed.push('EXT_mesh_gpu_instancing');
    const widths = s.project.tiers.map((x) => x.seatWidth ?? s.project.seating.seatWidth);
    s.profiles.forEach((pr, ti) => {
      const idx: number[] = [];
      for (let i = 0; i < t.count; i++) if (t.status[i] === 0 && t.tier[i] === ti) idx.push(i);
      if (!idx.length) return;
      const w = Math.max(380, widths[ti] - 40);
      const seat = mergeMeshes([boxSolid([-215, -w / 2, 300], [215, w / 2, 455]), boxSolid([-285, -w / 2, 425], [-215, w / 2, 855])]);
      const tr = new Float32Array(idx.length * 3), rot = new Float32Array(idx.length * 4);
      idx.forEach((i, k) => {
        tr.set([t.x[i] / 1000, t.z[i] / 1000, -t.y[i] / 1000], k * 3);
        rot.set([0, Math.sin(t.rot[i] / 2), 0, Math.cos(t.rot[i] / 2)], k * 4);
      });
      const club = s.project.tiers[pr.index]?.kind === 'club';
      nodes.push({ name: `SEATS.${pr.id}`, mesh: meshOf(`SEAT.${pr.id}`, seat, club ? '05_PREMIUM' : '03_SEATING'), extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: accessor(tr, 'VEC3', undefined, true), ROTATION: accessor(rot, 'VEC4') } } }, extras: { seats: idx.length, tier: pr.id, status: STATUS_LABEL.placeholder } });
      inGroup(club ? '05_PREMIUM' : '03_SEATING', nodes.length - 1);
    });
  }

  const groupNodes: number[] = [];
  for (const [name, kids] of [...groups].sort(([a], [b]) => a.localeCompare(b))) { nodes.push({ name, children: kids }); groupNodes.push(nodes.length - 1); }
  nodes.push({ name: s.project.name, children: groupNodes, extras: { generator: 'Manica', units: 'metres, +Y up (stadium +Z); origin at the centre of the field', capacity: s.metrics.total, note: 'Conceptual design — not a construction document' } });
  const root = nodes.length - 1;

  const json: any = {
    asset: { version: '2.0', generator: 'Manica 0.6.0' },
    scene: 0, scenes: [{ name: s.project.name, nodes: [root] }],
    nodes, meshes, materials, accessors, bufferViews, buffers: [{ byteLength }],
    ...(extensionsUsed.length ? { extensionsUsed } : {}),
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4, binPad = (4 - (byteLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + byteLength + binPad;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length + jsonPad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad);
  let o = 20 + jsonBytes.length + jsonPad;
  dv.setUint32(o, byteLength + binPad, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
