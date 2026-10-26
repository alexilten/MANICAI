/**
 * Round 06 acceptance tests (AJ–AO): the BIM element model, IFC 4, quantity schedules, the model check,
 * glTF and DXF exports, and the tier sections the exports are built from.
 */
import { describe, expect, it } from 'vitest';
import { getPreset, PRESETS } from '../src/core/presets';
import { tierOutline } from '../src/core/engine/profile';
import { buildModel, loopArea, ringLoop, shapeVolume, meshVolume } from '../src/export/model';
import { exportIfc, ifcCensus, ifcGuid, str } from '../src/export/ifc';
import { verifyModel, selfIntersects } from '../src/export/verify';
import { elementsCsv, elementVolume, quantities, quantitiesCsv } from '../src/export/quantities';
import { exportGlb } from '../src/export/gltf';
import { DXF_LAYERS, dxfLayer, exportDxf } from '../src/export/dxf';
import { fresh } from './helpers';

const TS = new Date('2026-01-01T00:00:00Z');

describe('AJ · BIM element model', () => {
  it('separates elements, masses, reservations and placeholders and gives every element an IFC class', () => {
    const s = fresh(), m = buildModel(s);
    const statuses = new Set(m.elements.map((e) => e.status));
    expect(statuses.has('element')).toBe(true);
    expect(statuses.has('reservation')).toBe(true);
    for (const e of m.elements) {
      expect(e.ifc.cls).toMatch(/^Ifc/);
      expect(e.layer.length).toBeGreaterThan(0);
    }
    // spaces are reservations, never building elements
    for (const e of m.elements.filter((x) => x.ifc.cls === 'IfcSpace')) expect(e.status).toBe('reservation');
    expect(new Set(m.elements.map((e) => e.id)).size).toBe(m.elements.length);
  });

  it('measures arc loops exactly: a ring loop encloses the analytic stadium-shaped area', () => {
    const s = fresh(), ring = s.ring;
    const a = Math.abs(loopArea(ringLoop(ring, 0)));
    expect(a).toBeGreaterThan(0);
    // the exact area grows by perimeter·δ + π δ² for an offset δ (rounded-rectangle parallel curve)
    const d = 5000, a2 = Math.abs(loopArea(ringLoop(ring, d)));
    const per = (a2 - a - Math.PI * d * d) / d;
    const a3 = Math.abs(loopArea(ringLoop(ring, 2 * d)));
    expect(a3 - a).toBeCloseTo(per * 2 * d + Math.PI * 4 * d * d, -3);
  });

  it('keeps exact and tessellated volumes within 1 % for every extruded or revolved element', () => {
    const m = buildModel(fresh());
    for (const e of m.elements) {
      if (e.shapes.every((sh) => sh.kind === 'mesh')) continue;
      const ex = e.shapes.reduce((a, sh) => a + shapeVolume(sh), 0), mv = meshVolume(e.mesh());
      expect(Math.abs(ex - mv) / ex, e.id).toBeLessThan(0.01);
    }
  });
});

describe('AK · IFC 4', () => {
  it('writes a deterministic IFC4 file with stable GlobalIds', () => {
    const s = fresh();
    const a = exportIfc(s, { seats: false, timestamp: TS }), b = exportIfc(s, { seats: false, timestamp: TS });
    expect(a).toBe(b);
    expect(a).toMatch(/FILE_SCHEMA\(\('IFC4'\)\)/);
    expect(ifcGuid('TERRACE.T1.N')).toBe(ifcGuid('TERRACE.T1.N'));
    expect(ifcGuid('TERRACE.T1.N')).not.toBe(ifcGuid('TERRACE.T1.S'));
    expect(ifcGuid('x')).toMatch(/^[0-9A-Za-z_$]{22}$/);
    expect(str('Café')).toBe("'Caf\\X2\\00E9\\X0\\'");
  });

  it('has one spatial tree and as many entities of each class as the model', () => {
    const s = fresh(), m = buildModel(s), text = exportIfc(s, { seats: true, timestamp: TS, model: m });
    const c = ifcCensus(text);
    expect(c.get('IFCPROJECT')).toBe(1);
    expect(c.get('IFCSITE')).toBe(1);
    expect(c.get('IFCBUILDING')).toBe(1);
    expect(c.get('IFCBUILDINGSTOREY')).toBe(m.storeys.length);
    expect(c.get('IFCFURNITURE')).toBe(s.metrics.net);
    expect(c.get('IFCLIGHTFIXTURE')).toBe(s.systems.fixtures.length);
    expect(c.get('IFCOPENINGELEMENT') ?? 0).toBe(m.elements.filter((e) => e.voids).length);
    expect(c.get('IFCRELVOIDSELEMENT') ?? 0).toBe(m.elements.filter((e) => e.voids).length);
    // no inline entity instances: every attribute reference is a #id
    expect(text).not.toMatch(/\(IFCCARTESIANPOINT/);
    // custom property sets never use the reserved Pset_ prefix
    for (const mt of text.matchAll(/IFCPROPERTYSET\('[^']+',#\d+,'([^']+)'/g)) if (!['Pset_SpaceCommon'].includes(mt[1])) expect(mt[1]).not.toMatch(/^Pset_/);
  });
});

describe('AL · quantity schedules', () => {
  it('sums the element schedule into the summary and states a method for every row', () => {
    const s = fresh(), m = buildModel(s), rows = quantities(s, m);
    for (const r of rows) { expect(r.method.length).toBeGreaterThan(0); expect(r.status.length).toBeGreaterThan(0); }
    const terraces = rows.filter((r) => r.section === 'Seating terraces' && r.volume !== undefined);
    const want = m.elements.filter((e) => e.category === 'Seating terraces').reduce((a, e) => a + elementVolume(e), 0);
    expect(terraces.reduce((a, r) => a + (r.volume ?? 0), 0)).toBeCloseTo(want, 3);
    const seats = rows.filter((r) => r.unit === 'seats' || /seat/i.test(r.item)).reduce((a, r) => a + (r.unit === 'seats' ? r.quantity : 0), 0);
    if (seats) expect(seats).toBeGreaterThanOrEqual(s.metrics.net);
  });

  it('writes CSVs with one line per element', () => {
    const s = fresh(), m = buildModel(s);
    const el = elementsCsv(s, m).trim().split('\n');
    expect(el.length).toBe(m.elements.length + 2);
    expect(quantitiesCsv(s, m).split('\n')[1]).toBe('section,item,count,quantity,unit,volume_m3,area_m2,method,status');
  });
});

describe('AM · model check', () => {
  it('passes every check on every preset, including the IFC read-back', () => {
    for (const pr of PRESETS) {
      const s = fresh(pr.build()), m = buildModel(s);
      const r = verifyModel(s, m, exportIfc(s, { seats: false, timestamp: TS, model: m }));
      const bad = r.checks.filter((c) => c.status !== 'pass').map((c) => `${c.id}: ${c.detail}`);
      expect(bad, pr.id).toEqual([]);
      expect(r.checks.length).toBe(15);
    }
  }, 120_000);

  it('detects a crossing polygon', () => {
    expect(selfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true);
    expect(selfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false);
  });
});

describe('AN · glTF and DXF', () => {
  it('writes a valid GLB container in metres with seats as GPU instances', () => {
    const s = fresh(), glb = exportGlb(s);
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(4, true)).toBe(2);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const jl = dv.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jl)));
    expect(json.asset.version).toBe('2.0');
    expect(json.extensionsUsed).toContain('EXT_mesh_gpu_instancing');
    const inst = json.nodes.filter((n: { extensions?: object }) => n.extensions).reduce((a: number, n: { extras: { seats: number } }) => a + n.extras.seats, 0);
    expect(inst).toBe(s.metrics.net);
    // metres: the bowl is a few hundred metres across, not a few hundred thousand
    const maxX = Math.max(...json.accessors.filter((a: { max?: number[]; type: string }) => a.max && a.type === 'VEC3').map((a: { max: number[] }) => a.max[0]));
    expect(maxX).toBeGreaterThan(50); expect(maxX).toBeLessThan(500);
  });

  it('keeps DXF R12 layer names unique and within 31 characters', () => {
    const names = DXF_LAYERS.map((l) => l.dxf);
    for (const n of names) { expect(n.length).toBeLessThanOrEqual(31); expect(n).toMatch(/^[A-Z0-9_-]+$/); }
    expect(new Set(names).size).toBe(names.length);
    expect(dxfLayer('03_SEATING::T1_LOWER')).toBe('03_T1_LOWER');
    const text = exportDxf(fresh(), { seats: false });
    expect(text).toMatch(/AC1009/);
    expect(text.trim().endsWith('EOF')).toBe(true);
  });
});

describe('AO · tier sections', () => {
  it('draws every tier outline of every preset as a simple polygon', () => {
    for (const pr of PRESETS) {
      const s = fresh(pr.build());
      for (const t of s.profiles) {
        for (const n of [1, Math.ceil(t.base / 2), t.base]) expect(selfIntersects(tierOutline(t, n)), `${pr.id} ${t.id} ${n}`).toBe(false);
      }
    }
  });

  it('builds the Allegiant-inspired preset with no failing checks', () => {
    const s = fresh(getPreset('allegiant').build());
    expect(verifyModel(s).fail).toBe(0);
  });
});
