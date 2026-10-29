/**
 * Round 04 acceptance tests (X–AC): structural grid and members, roof typologies, coverage and the
 * high-ball view, facade and portals, back-of-house, closed solids, inward plan offsets, v3 → v4
 * migration and the Rhino architecture layers.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { bohNeeds, capSolid, COLUMN_SETBACK, EAVE, memberSolid, ROOF_SKIN, type Member } from '../src/core/engine/architecture';
import type { BoxMesh } from '../src/core/engine/building';
import { enclosedArea, perimeter, planOffset, pointAt, segmentLength, SEGMENTS } from '../src/core/engine/plan';
import { soffitZ } from '../src/core/engine/building';
import { getPreset } from '../src/core/presets';
import { defaultProject, parseProject, SCHEMA_VERSION, type Project, type RoofType } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';
import { clone, fresh, rhino } from './helpers';

function volume(m: BoxMesh) {
  let v = 0;
  const P = m.positions, I = m.index;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  return v;
}
const quadArea = (q: [number, number][]) => Math.abs(q.reduce((a, [x, y], i) => { const [x2, y2] = q[(i + 1) % q.length]; return a + x * y2 - x2 * y; }, 0)) / 2;
const withRoof = (type: RoofType, p: Project = defaultProject(), extra: Partial<Project['architecture']['roof']> = {}) => { p.architecture.roof = { ...p.architecture.roof, type, ...extra }; return p; };

describe('X · structural grid and members', () => {
  it('spaces radial frames at the bay along the outer column line, every region included', () => {
    const s = fresh(), a = s.architecture, bay = s.project.architecture.structure.bay;
    const dCol = a.facade.d - COLUMN_SETBACK;
    let n = 0;
    for (const seg of SEGMENTS) { const L = segmentLength(s.ring, seg, dCol); if (L >= 1000) n += Math.max(1, Math.round(L / bay)); }
    expect(a.frames).toHaveLength(n);
    expect(a.rings[a.rings.length - 1].d).toBe(dCol);
    // ring lines are lettered in order outward and kept at least 2.5 m apart
    a.rings.forEach((r, i) => { expect(r.id).toBe(`GL.${String.fromCharCode(65 + i)}`); if (i) expect(r.d - a.rings[i - 1].d).toBeGreaterThan(2500); });
    const q = clone(s.project); q.architecture.structure.bay = 6000;
    expect(fresh(q).architecture.frames.length).toBeGreaterThan(n);
  });

  it('runs a raker under each tier along its soffit, and stops columns at the raker underside', () => {
    const s = fresh(), a = s.architecture, h = s.project.architecture.structure.rakerDepth;
    const t2 = s.profiles[1];
    const r = a.members.find((m) => m.kind === 'raker' && m.id.startsWith('RKR.T2.') && m.seg === 'N')!;
    const [, , ob, ib] = r.section; // outer-top, inner-top
    expect(ib[1]).toBeCloseTo(soffitZ(t2, ib[0]), 6);
    expect(ob[1]).toBeCloseTo(soffitZ(t2, ob[0]), 6);
    expect(r.section[0][1]).toBeCloseTo(ib[1] - h, 6);
    // every column on a tier support line tops out at that tier's raker underside
    const back = a.rings.find((x) => Math.abs(x.d - (t2.back - 1000)) < 1)!;
    const col = a.members.find((m) => m.kind === 'column' && m.frame === r.frame && m.id.startsWith(`COL.${back.id.slice(3)}.`))!;
    expect(col.section[2][1]).toBeCloseTo(soffitZ(t2, back.d) - h, 6);
    expect(a.metrics.rakers).toBe(a.members.filter((m) => m.kind === 'raker').length);
  });
});

describe('Y · roof typologies', () => {
  it('a perimeter canopy clears the top row by the set clearance and covers every seat it overhangs', () => {
    const s = fresh(withRoof('perimeter')), a = s.architecture, R = s.project.architecture.roof;
    const r = a.roof, dCol = r.dOut - EAVE - COLUMN_SETBACK;
    const top = (d: number) => r.zTop0 + (dCol - d) * r.slope;
    // open roofs carry their frames above the deck: at the back of the highest row the deck underside is at least the clearance above it
    expect(r.exposed).toBe(true);
    const t = s.profiles[s.profiles.length - 1], last = t.rows[t.rows.length - 1];
    const dTop = last.d + t.rowDepth;
    expect(top(dTop) - ROOF_SKIN).toBeGreaterThanOrEqual(last.z + R.clearance - 1);
    const rf = a.members.find((m) => m.kind === 'roofFrame')!;
    expect(rf.section[0][1]).toBeCloseTo(top(r.dIn), 6);
    expect(rf.section[2][1] - rf.section[1][1]).toBeCloseTo(R.depth, 6);
    expect(r.dIn).toBe(-R.overhang);
    expect(a.metrics.coverage).toBe(1);
    expect(a.metrics.roofPlan).toBeCloseTo((enclosedArea(s.ring, r.dOut) - enclosedArea(s.ring, r.dIn)) / 1e6, 3);
    // pulling the edge back 30 m behind the first row uncovers the front rows
    const back = fresh(withRoof('perimeter', defaultProject(), { overhang: -30000 })).architecture.metrics;
    expect(back.coverage).toBeLessThan(0.75);
    expect(back.coverage).toBeGreaterThan(0.1);
  });

  it('a partial canopy covers only its stands, and the open air type builds no roof', () => {
    const s = fresh(withRoof('canopy', defaultProject(), { stands: ['N'] })), a = s.architecture;
    expect(a.roof.spans).toEqual([{ seg: 'N', u0: 0, u1: 1 }]);
    expect(a.members.filter((m) => m.kind === 'roofFrame').every((m) => m.seg === 'N')).toBe(true);
    const nSeats = s.metrics.bySector.north;
    expect(a.metrics.covered).toBe(nSeats);
    const o = fresh(withRoof('open')).architecture;
    expect([o.roof.spans.length, o.metrics.roofPlan, o.metrics.coverage, o.members.filter((m) => m.kind === 'roofFrame').length]).toEqual([0, 0, 0, 0]);
    expect(o.metrics.facadeTop).toBeGreaterThan(0);
  });

  it('the high-ball view is the back-row sightline under the leading edge, measured over the centre spot', () => {
    const s = fresh(withRoof('canopy', defaultProject(), { stands: ['N'] })), a = s.architecture;
    const t = s.profiles[s.profiles.length - 1], eye = t.rows[s.layout.rows.N[t.index] - 1];
    const dCol = a.roof.dOut - EAVE - COLUMN_SETBACK;
    const zEdge = a.roof.zTop0 + (dCol - a.roof.dIn) * a.roof.slope - ROOF_SKIN; // deck underside at the edge (frames above)
    const dC = -(s.ring.dist.N + s.field.width / 2);
    expect(a.metrics.viewClear).toBeCloseTo(eye.eyeZ + ((zEdge - eye.eyeZ) * (eye.eyeD - dC)) / (eye.eyeD - a.roof.dIn), 3);
    // a low, field-falling roof fails the view and is reported
    const low = withRoof('canopy', defaultProject(), { stands: ['N'], clearance: 3000, pitch: -10, overhang: 20000, skyView: 30000 });
    expect(fresh(low).warnings.some((w) => w.code === 'roof.view')).toBe(true);
  });

  it('enclosed roofs cap the field: a dome, long-span trusses, or retractable panels that slide open', () => {
    for (const type of ['enclosed', 'etfe', 'truss'] as const) {
      const a = fresh(withRoof(type)).architecture;
      expect(a.roof.cap, type).not.toBeNull();
      expect(a.metrics.coverage, type).toBe(1);
      expect(a.roof.boxes.filter((b) => b.kind === 'truss').length > 0, type).toBe(type !== 'enclosed');
      expect(a.metrics.viewClear, type).toBeGreaterThan(0);
    }
    const closed = fresh(withRoof('retractable', defaultProject(), { open: 0 })).architecture;
    const open = fresh(withRoof('retractable', defaultProject(), { open: 1 })).architecture;
    const pw = (x: typeof open) => x.roof.boxes.find((b) => b.id === 'PANEL.W')!;
    expect(pw(open).max[0]).toBeLessThan(pw(closed).max[0]);
    expect(closed.metrics.coverage).toBe(1);
    expect(open.metrics.coverage).toBeLessThanOrEqual(closed.metrics.coverage);
  });
});

describe('Z · facade and envelope', () => {
  it('wraps the building at the set offset beyond the cores, up to the roof, with portals cut in', () => {
    const p = defaultProject(); p.architecture.facade = { ...p.architecture.facade, offset: 5000, portals: 4, portalWidth: 12000, portalHeight: 7000 };
    const s = fresh(p), a = s.architecture;
    expect(a.facade.d).toBe(s.building.metrics.outerD + 5000);
    expect(a.facade.canopies).toHaveLength(4);
    expect(a.metrics.portals).toBe(4);
    for (const seg of ['N', 'S', 'E', 'W'] as const) expect(a.facade.pieces.filter((q) => q.seg === seg)).toHaveLength(3);
    // the facade meets the top of the roof deck at the facade line
    const dCol = a.facade.d - COLUMN_SETBACK;
    expect(a.facade.top.N).toBeCloseTo(a.roof.zTop0 + (dCol - a.facade.d) * a.roof.slope, 6);
    let area = 0;
    for (const seg of SEGMENTS) { const L = segmentLength(s.ring, seg, a.facade.d); if (L >= 500) area += L * a.facade.top[seg]; }
    expect(a.metrics.facadeArea).toBeCloseTo((area - 4 * 12000 * 7000) / 1e6, 3);
    expect(a.metrics.envelopeFootprint).toBeCloseTo(enclosedArea(s.ring, a.facade.d) / 1e6, 6);
  });

  it('places one mullion or fin per module, and none on a solid facade', () => {
    const p = defaultProject(); p.architecture.facade.type = 'fins';
    const a = fresh(p).architecture;
    expect(a.members.filter((m) => m.kind === 'mullion')).toHaveLength(a.metrics.facadeModules);
    expect(a.members.find((m) => m.kind === 'mullion')!.section[1][0] - a.facade.d).toBeGreaterThan(1000);
    p.architecture.facade.type = 'solid';
    expect(fresh(p).architecture.members.filter((m) => m.kind === 'mullion')).toHaveLength(0);
  });
});

describe('AA · back-of-house', () => {
  it('lines the event-level service corridor, with the tunnel on the main stand centre', () => {
    const p = getPreset('generic-nfl').build();
    const s = fresh(p), a = s.architecture, B = p.architecture.boh;
    const c = a.boh.corridor!;
    expect(c.d1 - c.d0).toBeCloseTo(B.corridor, 6);
    const rooms = a.boh.zones.filter((z) => z.kind !== 'tunnel');
    for (const z of rooms) { expect(z.d0).toBe(c.d1); expect(z.z0).toBe(0); expect(z.z1).toBeLessThanOrEqual(B.clear); }
    const tunnel = a.boh.zones.find((z) => z.kind === 'tunnel')!;
    expect(tunnel.seg).toBe(B.mainStand);
    expect((tunnel.u0 + tunnel.u1) / 2).toBeCloseTo(0.5, 6);
    expect(tunnel.d1).toBe(c.d0);
    // home and away locker rooms sit either side of it on the main stand
    expect(rooms.filter((z) => z.kind === 'lockers' && z.seg === B.mainStand).length).toBeGreaterThanOrEqual(2);
    const need = bohNeeds(p, s.metrics.total);
    expect(a.metrics.bohNeeded).toBeCloseTo(Object.values(need).reduce((x, v) => x + v, 0), 6);
    expect(a.metrics.bohArea).toBeGreaterThan(a.metrics.bohNeeded * 0.98);
    expect(a.metrics.grossArea).toBeCloseTo(s.building.metrics.grossArea + a.metrics.bohArea + a.metrics.bohCorridorArea, 6);
  });

  it('reports back-of-house that does not fit its band', () => {
    const p = getPreset('generic-nfl').build(); p.architecture.boh.scale = 3;
    const s = fresh(p);
    expect(s.warnings.some((w) => w.code === 'boh.short')).toBe(true);
    expect(s.architecture.metrics.bohArea).toBeLessThan(s.architecture.metrics.bohNeeded);
  });
});

describe('AB · solids and inward plan offsets', () => {
  it('members, the cap and the plan path inside the front-row line are exact', () => {
    const s = fresh(), ring = s.ring;
    const m: Member = { id: 'T', kind: 'column', seg: 'NE', u: 0.3, section: [[1000, 0], [2000, 0], [2000, 5000], [1000, 5000]], width: 800 };
    expect(volume(memberSolid(ring, m)) / (quadArea(m.section) * 800)).toBeCloseTo(1, 5); // float32 vertices
    const sloped: Member = { ...m, kind: 'raker', seg: 'N', section: [[0, 0], [9000, 4000], [9000, 5000], [0, 1000]] };
    expect(volume(memberSolid(ring, sloped)) / (quadArea(sloped.section) * 800)).toBeCloseTo(1, 5);
    // flat cap: volume = enclosed area at the edge × thickness (the polygon chords the corner arcs)
    const v = volume(capSolid(ring, -2000, 30000, 0, 250));
    expect(v / (enclosedArea(ring, -2000) * 250)).toBeGreaterThan(0.995);
    expect(v / (enclosedArea(ring, -2000) * 250)).toBeLessThan(1.0001);
    // past the corner radius the path is a sharp rectangle: straights shorten, corners close
    const d = -(ring.r + 3000);
    expect(segmentLength(ring, 'N', d)).toBeCloseTo(2 * (ring.hx + d), 6);
    expect(segmentLength(ring, 'NE', d)).toBe(0);
    expect(perimeter(ring, d)).toBeCloseTo(4 * (ring.hx + d) + 4 * (ring.hy + d), 6);
    const a = pointAt(ring, 'N', 0, d), c = pointAt(ring, 'NE', 0.5, d);
    expect([a.x, a.y]).toEqual([c.x, c.y]);
    expect(planOffset(ring, c.x, c.y)).toBeCloseTo(d, 6); // the sharp corner is still at offset d from the front-row line
  });
});

describe('AC · v3 files and the Rhino architecture layers', () => {
  it('v3 files open with the default architecture and their Round 03 capacities', () => {
    for (const [f, total, suites] of [['generic-nfl', 64578, 544], ['allegiant', 64899, 1152]] as const) {
      const p = parseProject(readFileSync(`tests/fixtures/v3-${f}.manica.json`, 'utf8'));
      expect(p.version).toBe(SCHEMA_VERSION);
      expect(p.architecture).toEqual(defaultProject().architecture);
      const m = fresh(p).metrics;
      expect([m.total, m.suiteSeats], f).toEqual([total, suites]);
    }
  });

  let rh: RhinoModule;
  beforeAll(async () => { rh = await rhino(); });
  it('exports grid, structure, roof, facade and back-of-house, named and on their layers', () => {
    const s = fresh(getPreset('allegiant').build()), a = s.architecture;
    const f = inspect3dm(rh, exportRhino(rh, s, { version: 8, seats: false }));
    const on = (l: string) => f.objects.filter((o) => o.layer === l);
    expect(on('08_STRUCTURE::GRID')).toHaveLength(a.frames.length + a.rings.length);
    expect(on('08_STRUCTURE::RAKERS')).toHaveLength(a.metrics.rakers);
    expect(on('08_STRUCTURE::COLUMNS')).toHaveLength(a.metrics.columns);
    expect(on('09_ROOF::PRIMARY_FRAMES')).toHaveLength(a.metrics.roofFrames);
    expect(on('09_ROOF::CAP')).toHaveLength(1);
    expect(on('09_ROOF::TRUSSES')).toHaveLength(a.roof.boxes.filter((b) => b.kind === 'truss').length);
    expect(on('10_FACADE::MULLIONS')).toHaveLength(a.metrics.facadeModules);
    expect(on('10_FACADE::PORTALS')).toHaveLength(4);
    expect(f.objects.filter((o) => o.layer?.startsWith('16_BACK_OF_HOUSE::') && o.layer !== '16_BACK_OF_HOUSE::SERVICE_CORRIDOR')).toHaveLength(a.boh.zones.length);
    // a member written as an extrusion sits exactly where the engine put it
    const col = a.members.find((m) => m.kind === 'column')!;
    const o = f.objects.find((x) => x.name === col.id)!;
    const solid = memberSolid(s.ring, col), P = solid.positions;
    const ext = [0, 1, 2].map((k) => { let lo = Infinity, hi = -Infinity; for (let i = k; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [lo, hi]; });
    for (let k = 0; k < 3; k++) { expect(o.bbox!.min[k]).toBeCloseTo(ext[k][0], 0); expect(o.bbox!.max[k]).toBeCloseTo(ext[k][1], 0); }
  });
});
