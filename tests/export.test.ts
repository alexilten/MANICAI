/**
 * H · Rhino round trip. The file is written by the exporter and read back through openNURBS
 * (rhino3dm), so units, layers, block instances, names and positions are checked in the file,
 * not in the exporter's own bookkeeping.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { seatId } from '../src/core/engine/seats';
import { defaultProject, parseProject, serializeProject } from '../src/core/schema';
import { extents, type Stadium } from '../src/core/engine/stadium';
import { exportRhino, projectFrom3dm, type RhinoModule } from '../src/export/rhino';
import { inspect3dm, type FileInfo } from '../src/export/inspect3dm';
import { getPreset } from '../src/core/presets';
import { fresh, rhino } from './helpers';

let rh: RhinoModule, s: Stadium, bytes: Uint8Array, info: FileInfo;

beforeAll(async () => {
  rh = await rhino();
  s = fresh(defaultProject());
  bytes = exportRhino(rh, s, { version: 8, seats: true });
  info = inspect3dm(rh, bytes);
});

describe('H · Rhino .3dm export', () => {
  it('is a millimetre file', () => {
    expect(info.units).toBe('Millimeters');
  });

  it('has the Manica layer tree with tier and sector sublayers', () => {
    for (const l of ['00_REFERENCE', '01_FIELD', '02_BOWL_GEOMETRY', '03_SEATING', '90_DIMENSIONS', '91_ANALYSIS']) expect(info.layers.some((x) => x.startsWith(l)), l).toBe(true);
    expect(info.layers).toContain('02_BOWL_GEOMETRY::T1_LOWER_TIER');
    expect(info.layers.some((x) => x.startsWith('03_SEATING::T2'))).toBe(true);
  });

  it('writes one seat block instance per seat in use, and wheelchair spaces as their own block', () => {
    const t = s.seats.seats;
    let seats = 0, chairs = 0;
    for (let i = 0; i < t.count; i++) if (t.status[i] === 0) t.cls[i] === 2 ? chairs++ : seats++;
    const seatBlocks = info.blocks.filter((b) => b.name.startsWith('MANICA_SEAT_'));
    expect(seatBlocks.reduce((n, b) => n + b.instances, 0)).toBe(seats);
    expect(info.blocks.find((b) => b.name.startsWith('MANICA_WHEELCHAIR'))?.instances ?? 0).toBe(chairs);
    expect(seats + chairs).toBe(s.metrics.net);
  });

  it('places seats at the engine positions, with their ids and C-values', () => {
    const t = s.seats.seats;
    const byName = new Map(info.objects.filter((o) => o.type === 'InstanceReference').map((o) => [o.name, o]));
    const ids = s.profiles.map((x) => x.id);
    for (let i = 0; i < t.count; i += 997) {
      const o = byName.get(seatId(t, i, ids))!;
      expect(o, seatId(t, i, ids)).toBeDefined();
      expect(o.insertion![0]).toBeCloseTo(t.x[i], 3);
      expect(o.insertion![1]).toBeCloseTo(t.y[i], 3);
      expect(o.insertion![2]).toBeCloseTo(t.z[i], 3);
      expect(Number(o.user['manica.cvalue_mm'])).toBeCloseTo(t.cValue[i], 0);
    }
  });

  it('places the bowl geometry around the field centre', () => {
    const terraces = info.objects.filter((o) => o.layer?.startsWith('02_BOWL_GEOMETRY') && o.bbox);
    expect(terraces.length).toBeGreaterThan(0);
    const max = [-Infinity, -Infinity, -Infinity], min = [Infinity, Infinity, Infinity];
    for (const o of terraces) for (let k = 0; k < 3; k++) { max[k] = Math.max(max[k], o.bbox!.max[k]); min[k] = Math.min(min[k], o.bbox!.min[k]); }
    expect(min[0]).toBeCloseTo(-max[0], 0);
    expect(min[1]).toBeCloseTo(-max[1], 0);
    expect(max[0]).toBeCloseTo(extents(s.ring, s.layout, s.profiles).maxX, -2);
    expect(min[2]).toBeGreaterThanOrEqual(-1);
    expect(info.groups.some((g) => g.startsWith('TERRACE_T1'))).toBe(true);
  });

  it('carries the project inside the file so it reopens in Manica', () => {
    const text = projectFrom3dm(rh, bytes);
    expect(text).toBeTruthy();
    expect(parseProject(text!)).toEqual(parseProject(serializeProject(s.project)));
  });

  it('writes a Rhino 7 file and a bowl-only file', () => {
    const b7 = exportRhino(rh, s, { version: 7, seats: false });
    const i7 = inspect3dm(rh, b7, { bboxes: false });
    expect(i7.units).toBe('Millimeters');
    // no seat blocks (floodlights stay block instances on 14_LIGHTING)
    expect(i7.objects.some((o) => o.type === 'InstanceReference' && !o.layer?.startsWith('14_LIGHTING'))).toBe(false);
    expect(b7.byteLength).toBeLessThan(bytes.byteLength);
  });

  it('writes vomitory solids, wheelchair positions and club seats to their own layers', () => {
    const g = fresh(getPreset('generic-nfl').build());
    const f = inspect3dm(rh, exportRhino(rh, g, { version: 8, seats: true }));
    const on = (l: string) => f.objects.filter((o) => o.layer === l);
    const voms = on('07_VERTICAL_CIRCULATION::VOMITORIES');
    expect(voms.length).toBe(g.metrics.vomitories);
    expect(voms.every((o) => o.type === 'Brep' && o.name.startsWith('VOM.'))).toBe(true);
    expect(on('04_ACCESSIBILITY::WHEELCHAIR_POSITIONS').length).toBe(g.metrics.accessible.wheelchair);
    expect(on('04_ACCESSIBILITY::COMPANION_SEATS').length).toBe(g.metrics.accessible.companion);
    const club = f.objects.filter((o) => o.layer?.startsWith('05_PREMIUM::') && o.type === 'InstanceReference').length;
    expect(club).toBe(g.metrics.byClass.premium);
    expect(f.blocks.some((b) => b.name === 'MANICA_SEAT_550MM')).toBe(true);
  });
});
