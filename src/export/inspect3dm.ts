/**
 * Re-open a .3dm and summarise it. Used by the automated export tests and the sample-export
 * script — it reads the file back through openNURBS rather than trusting the exporter's own
 * bookkeeping. Every wasm-side handle is released as it goes, so stadium-sized files
 * (tens of thousands of block instances) fit in the wasm heap.
 */
import type { RhinoModule } from './rhino';

export interface BBoxInfo { min: number[]; max: number[] }
export interface ObjInfo { name: string; layer: string; type: string; block?: string; insertion?: number[]; bbox?: BBoxInfo; user: Record<string, string> }
export interface FileInfo {
  units: string; layers: string[];
  blocks: { name: string; parts: number; instances: number }[];
  objects: ObjInfo[]; strings: Record<string, string>; groups: string[];
}

const del = (...xs: unknown[]) => { for (const x of xs) (x as { delete?: () => void } | null)?.delete?.(); };

export function inspect3dm(rh: RhinoModule, bytes: Uint8Array, opts: { bboxes?: boolean } = {}): FileInfo {
  const doc = rh.File3dm.fromByteArray(bytes);
  if (!doc) throw new Error('openNURBS could not read the file');
  const layersById = new Map<string, { name: string; parent: string }>();
  const lt = doc.layers();
  for (let i = 0; i < lt.count; i++) { const l = lt.get(i); layersById.set(l.id, { name: l.name, parent: l.parentLayerId }); del(l); }
  const fullPath = (id: string): string => { const l = layersById.get(id)!; return layersById.has(l.parent) ? `${fullPath(l.parent)}::${l.name}` : l.name; };
  const layers = [...layersById.keys()].map(fullPath);

  const unitsEnum = rh.UnitSystem as Record<string, { value: number }>;
  const u = doc.settings().modelUnitSystem as { value: number };
  const units = Object.keys(unitsEnum).find((k) => unitsEnum[k]?.value === u.value) ?? String(u.value);

  const idefs = new Map<string, { name: string; parts: number }>();
  const it = doc.instanceDefinitions();
  for (let i = 0; i < it.count; i++) { const d = it.get(i); idefs.set(d.id, { name: d.name, parts: (d.getObjectIds() as string[]).length }); del(d); }
  const instanceCount = new Map<string, number>();
  const objects: ObjInfo[] = [];
  const table = doc.objects();
  for (let i = 0; i < table.count; i++) {
    const o = table.get(i);
    const a = o.attributes();
    if (a.isInstanceDefinitionObject) { del(a, o); continue; }
    const g = o.geometry();
    const type = g.constructor.name;
    const user: Record<string, string> = {};
    for (const [k, v] of a.getUserStrings() as [string, string][]) user[k] = v;
    const info: ObjInfo = { name: a.name, layer: layers[a.layerIndex], type, user };
    if (type === 'InstanceReference') {
      const def = idefs.get(g.parentIdefId)!;
      info.block = def.name;
      const xf = g.xform;
      info.insertion = [xf.m03, xf.m13, xf.m23];
      del(xf);
      instanceCount.set(def.name, (instanceCount.get(def.name) ?? 0) + 1);
    } else if (opts.bboxes !== false) {
      const b = g.getBoundingBox();
      info.bbox = { min: b.min, max: b.max };
      del(b);
    }
    objects.push(info);
    del(g, a, o);
  }
  const blocks = [...idefs.values()].map((d) => ({ name: d.name, parts: d.parts, instances: instanceCount.get(d.name) ?? 0 }));
  const strings: Record<string, string> = {};
  for (let i = 0; i < doc.strings().count; i++) { const kv = doc.strings().get(i) as [string, string]; strings[kv[0]] = kv[1]; }
  const groups: string[] = [];
  for (let i = 0; i < doc.groups().count; i++) { const g = doc.groups().get(i); groups.push(g.name); del(g); }
  del(doc);
  return { units, layers, blocks, objects, strings, groups };
}
