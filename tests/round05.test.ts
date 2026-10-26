/**
 * Round 05 acceptance tests (AD–AI): field lighting, video and ribbon boards, broadcast positions,
 * MEP space reservations, service access, v4 → v5 migration and the Rhino systems layers.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { EAVE, roofUnderAt } from '../src/core/engine/architecture';
import { pointAt, SECTORS, SECTOR_OF, segmentLength, SEGMENTS } from '../src/core/engine/plan';
import { BOARD_CLEAR_BEHIND, MAX_TILT, MIN_LIGHT_ANGLE, mepNeeds, TRANSFORMER_KVA } from '../src/core/engine/systems';
import { getPreset } from '../src/core/presets';
import { defaultProject, parseProject, type Project, type RoofType } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';
import { clone, fresh, rhino } from './helpers';

const withRoof = (type: RoofType, p: Project = defaultProject(), extra: Partial<Project['architecture']['roof']> = {}) => { p.architecture.roof = { ...p.architecture.roof, type, ...extra }; return p; };
const deg = (r: number) => (r * 180) / Math.PI;

describe('AD · field lighting', () => {
  it('counts fixtures by the lumen method and adds up their load', () => {
    const s = fresh(), L = s.project.systems.lighting, lm = s.systems.metrics.lighting, f = s.field.surface;
    const A = ((f.maxX - f.minX) * (f.maxY - f.minY)) / 1e6;
    const n = Math.ceil((L.target * A) / (L.lumens * L.maintenance * L.utilisation));
    expect(lm.fixtures).toBe(n);
    expect(s.systems.fixtures).toHaveLength(n);
    expect(lm.average).toBeGreaterThanOrEqual(L.target);
    expect(lm.average - L.target).toBeLessThan((L.lumens * L.maintenance * L.utilisation) / A);
    expect(lm.loadKW).toBeCloseTo((n * L.watts) / 1000, 6);
    // twice the output per fixture needs half the fixtures
    const q = clone(s.project); q.systems.lighting.lumens *= 2;
    expect(fresh(q).systems.metrics.lighting.fixtures).toBe(Math.ceil(n / 2));
  });

  it('hangs the fixtures from a catwalk under a ringing roof, aimed into the field', () => {
    const s = fresh(), r = s.architecture.roof, sy = s.systems, b = s.field.boundary;
    expect(sy.metrics.lighting.mount).toBe('roof');
    const cat = sy.bands.find((x) => x.kind === 'catwalk')!;
    expect((cat.d0 + cat.d1) / 2).toBeCloseTo(r.dIn + 1500, 6);
    expect(cat.z1).toBeCloseTo(roofUnderAt(r, r.dIn + 1500) - 1500, 6);
    const top = Math.max(...s.profiles.map((t) => t.top));
    for (const fx of sy.fixtures) {
      expect(fx.at[2]).toBeLessThan(cat.z0);
      expect(fx.at[2]).toBeGreaterThan(top);
      expect(fx.aim[0]).toBeGreaterThanOrEqual(b.minX - 1); expect(fx.aim[0]).toBeLessThanOrEqual(b.maxX + 1);
      expect(fx.aim[1]).toBeGreaterThanOrEqual(b.minY - 1); expect(fx.aim[1]).toBeLessThanOrEqual(b.maxY + 1);
      expect(fx.tilt).toBeCloseTo(deg(Math.atan2(Math.hypot(fx.aim[0] - fx.at[0], fx.aim[1] - fx.at[1]), fx.at[2])), 6);
    }
    // the sides carry more fixtures per metre than the ends
    const per = (g: string) => sy.fixtures.filter((x) => x.id.startsWith(`LGT.${g}.`)).length / segmentLength(s.ring, g as 'N', r.dIn + 1500);
    expect(per('N')).toBeGreaterThan(per('E'));
    const lowest = Math.min(...sy.fixtures.map((x) => deg(Math.atan2(x.at[2], Math.hypot(x.at[0], x.at[1])))));
    expect(sy.metrics.lighting.minAngle).toBeCloseTo(lowest, 6);
  });

  it('stands on four corner masts tall enough for the angle when the roof leaves the corners open', () => {
    const s = fresh(withRoof('canopy')), sy = s.systems, lm = sy.metrics.lighting;
    expect(lm.mount).toBe('masts');
    expect(sy.zones.filter((z) => z.kind === 'mast')).toHaveLength(4);
    expect(lm.minAngle).toBeGreaterThanOrEqual(MIN_LIGHT_ANGLE);
    expect(lm.mastHeight).toBe(Math.max(...sy.zones.filter((z) => z.kind === 'head').map((z) => z.z1)));
    expect(s.warnings.some((w) => w.code === 'lighting.angle')).toBe(false);
    // asking for the roof without a ringing roof falls back to masts, and says so
    const q = withRoof('canopy'); q.systems.lighting.mount = 'roof';
    expect(fresh(q).warnings.some((w) => w.code === 'lighting.mount')).toBe(true);
  });

  it('flags a low roof: fixtures below the 25° angle and aimed past 70°', () => {
    const s = fresh(withRoof('perimeter', defaultProject(), { clearance: 3000, overhang: -6000 })), lm = s.systems.metrics.lighting;
    expect(lm.minAngle).toBeLessThan(MIN_LIGHT_ANGLE);
    expect(s.warnings.some((w) => w.code === 'lighting.angle')).toBe(true);
    expect(lm.overTilt).toBe(s.systems.fixtures.filter((f) => f.tilt > MAX_TILT).length);
    if (lm.overTilt) expect(s.warnings.some((w) => w.code === 'lighting.tilt')).toBe(true);
  });
});

describe('AE · video and ribbon boards', () => {
  it('stands end boards behind the back row, cut to fit under the roof', () => {
    const p = defaultProject(), B = p.systems.boards;
    const open = fresh(withRoof('open', clone(p)));
    const boards = open.systems.zones.filter((z) => z.kind === 'board');
    expect(boards.map((z) => z.seg).sort()).toEqual(['E', 'W']);
    for (const z of boards) {
      const t = open.profiles.filter((x) => open.layout.rows[z.seg][x.index] > 0).at(-1)!;
      const r = t.rows[open.layout.rows[z.seg][t.index] - 1];
      expect(z.d0).toBeCloseTo(r.d + t.rowDepth + 1000, 6);
      expect(z.z0).toBeCloseTo(r.z + BOARD_CLEAR_BEHIND, 6);
      expect(z.z1 - z.z0).toBe(B.height);
    }
    expect(open.systems.metrics.boards.area).toBeCloseTo((2 * B.width * B.height) / 1e6, 6);
    // under the default perimeter roof the boards stop 0.5 m below the structure
    const s = fresh(clone(p)), r = s.architecture.roof;
    for (const z of s.systems.zones.filter((x) => x.kind === 'board')) expect(z.z1).toBeCloseTo(Math.min(roofUnderAt(r, z.d0), roofUnderAt(r, z.d0 + 1600)) - 500, 6);
    expect(s.systems.metrics.boards.clash).toBeGreaterThan(0);
    expect(s.warnings.some((w) => w.code === 'board.roof')).toBe(true);
  });

  it('hangs a centre board only from a fixed roof over the field, clear of the high-ball zone', () => {
    const p = withRoof('open'); p.systems.boards.type = 'centre';
    const open = fresh(p);
    expect(open.systems.boxes).toHaveLength(0);
    expect(open.warnings.some((w) => w.code === 'board.centre')).toBe(true);
    const e = withRoof('etfe', getPreset('allegiant').build()); e.systems.boards.type = 'centre';
    const s = fresh(e), b = s.systems.boxes[0], B = e.systems.boards;
    expect(b.min[2]).toBe(B.clear);
    expect(b.max[2] - b.min[2]).toBe(B.height);
    expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(s.ring.cx, 6);
    expect(s.systems.metrics.boards.area).toBeCloseTo((2 * (B.width + 0.6 * B.width) * B.height) / 1e6, 6);
    e.systems.boards.clear = e.architecture.roof.skyView - 5000;
    expect(fresh(e).warnings.some((w) => w.code === 'board.low')).toBe(true);
  });

  it('runs LED ribbons along every upper-tier fascia', () => {
    const s = fresh();
    let want = 0;
    for (const t of s.profiles.slice(1)) for (const g of SEGMENTS) if (s.layout.rows[g][t.index] > 0 && segmentLength(s.ring, g, t.front) >= 500) want += segmentLength(s.ring, g, t.front);
    expect(s.systems.metrics.boards.ribbon).toBeCloseTo(want, 3);
    const q = clone(s.project); q.systems.boards.ribbon = false;
    expect(fresh(q).systems.zones.some((z) => z.kind === 'ribbon')).toBe(false);
  });
});

describe('AF · broadcast', () => {
  it('puts the main camera on the main stand at halfway, with line and goal cameras', () => {
    const p = getPreset('generic-nfl').build(), s = fresh(p), sy = s.systems;
    const main = sy.cameras[0];
    expect(main.id).toBe('BRD.MAIN');
    expect(main.eye[0]).toBeCloseTo(s.ring.cx, 3);
    expect(Math.sign(main.eye[1])).toBe(p.architecture.boh.mainStand === 'S' ? -1 : 1);
    expect(main.depression).toBeCloseTo(deg(Math.atan2(main.eye[2], Math.hypot(main.eye[0], main.eye[1]))), 6);
    expect(sy.cameras.map((c) => c.id)).toEqual(['BRD.MAIN', 'BRD.LINE_W', 'BRD.LINE_E', 'BRD.GOAL_E', 'BRD.GOAL_W']);
    // NFL: the line cameras look at the 20-yard lines, 30 yd from the end lines
    expect(Math.abs(sy.cameras[1].target[0])).toBeCloseTo(s.field.boundary.maxX - 30 * 914.4, 3);
    const t2 = s.profiles[1];
    expect(main.eye[2]).toBeCloseTo(t2.bottom + 1600, 6);
  });

  it('counts the seats inside the press tribune without taking them out of capacity', () => {
    const s = fresh(), t = s.systems.zones.find((z) => z.kind === 'tribune')!, st = s.seats.seats;
    const main = s.project.architecture.boh.mainStand;
    const a = pointAt(s.ring, t.seg, t.u0, 0).x, b = pointAt(s.ring, t.seg, t.u1, 0).x;
    const tier = s.profiles.find((x) => x.index > 0 && s.layout.rows[main][x.index] > 0)!.index;
    let n = 0;
    for (let i = 0; i < st.count; i++) if (st.status[i] === 0 && st.tier[i] === tier && st.sector[i] === SECTORS.indexOf(SECTOR_OF[main]) && st.row[i] <= 2 && st.x[i] >= Math.min(a, b) && st.x[i] <= Math.max(a, b)) n++;
    expect(s.systems.metrics.broadcast.tribuneSeats).toBe(n);
    const q = clone(s.project); q.systems.broadcast.commentary = 120;
    const s2 = fresh(q);
    expect(s2.systems.metrics.broadcast.tribuneSeats).toBeGreaterThan(n);
    expect(s2.metrics.total).toBe(s.metrics.total);
  });
});

describe('AG · MEP space reservations', () => {
  it('sizes plant and counts transformers and generators from the planning ratios', () => {
    const s = fresh(getPreset('allegiant').build()), M = s.systems.metrics.mep;
    const need = mepNeeds(s.project, s.metrics.total, M.conditioned, s.systems.metrics.lighting.loadKW + s.systems.metrics.boards.area * 0.3 + (s.systems.metrics.boards.ribbon / 1000) * 0.27);
    expect(M.demandKW).toBeCloseTo(need.demandKW, 3);
    expect(M.transformers).toBe(Math.max(2, Math.ceil(need.demandKW / 0.9 / TRANSFORMER_KVA)));
    // an enclosed bowl is conditioned too
    expect(M.conditioned).toBeGreaterThan(s.architecture.metrics.grossArea);
    const open = fresh(withRoof('perimeter', getPreset('allegiant').build()));
    expect(open.systems.metrics.mep.conditioned).toBeCloseTo(open.architecture.metrics.grossArea, 6);
    // the energy centre sits on the yard frontage beyond the eave, with all the area it needs
    const pads = s.systems.zones.filter((z) => ['plant', 'switchgear', 'substation', 'generators', 'water', 'telecom'].includes(z.kind));
    for (const z of pads) expect(z.d0).toBeCloseTo(s.architecture.facade.d + EAVE + 3000, 6);
    const k = s.systems.metrics.service.yardFit;
    expect(pads.filter((z) => z.kind === 'plant').reduce((a, z) => a + z.area, 0)).toBeCloseTo(need.plant * k, 0);
  });

  it('gives every core three risers and, on every level, an air-handling and an electrical room beside it', () => {
    const s = fresh(), sy = s.systems, b = s.building;
    for (const c of b.cores) {
      const risers = sy.zones.filter((z) => z.kind === 'riser' && z.id.endsWith(`.${c.id}`));
      expect(risers.map((z) => z.system).sort()).toEqual(['electrical', 'hvac', 'plumbing']);
      for (const z of risers) { expect(z.z1).toBe(c.zTop); expect(z.u0 >= c.u1 || z.u1 <= c.u0).toBe(true); }
      const levels = b.levels.filter((l) => l.z + 3500 <= c.zTop);
      expect(sy.zones.filter((z) => z.kind === 'ahu' && z.id.endsWith(`.${c.id}`))).toHaveLength(levels.length);
      expect(sy.zones.filter((z) => z.kind === 'elecRoom' && z.id.endsWith(`.${c.id}`))).toHaveLength(levels.length);
    }
  });

  it('reserves a duct zone under every concourse ceiling and flags one that eats the headroom', () => {
    const s = fresh(), clear = s.project.building.concourseClear;
    const conc = s.building.levels.filter((l) => l.kind === 'concourse');
    const ducts = s.systems.bands.filter((x) => x.kind === 'duct');
    expect(ducts).toHaveLength(conc.length);
    ducts.forEach((d, i) => { expect(d.z1).toBe(conc[i].z + clear - 100); expect(d.z1 - d.z0).toBe(s.project.systems.mep.ductZone - 100); });
    const q = clone(s.project); q.systems.mep.ductZone = 1500;
    expect(fresh(q).warnings.some((w) => w.code === 'mep.duct')).toBe(true);
    const r = clone(s.project); r.systems.mep.scale = 3;
    const big = fresh(r);
    expect(big.systems.metrics.service.yardFit).toBeLessThan(1);
    expect(big.warnings.some((w) => w.code === 'systems.yard')).toBe(true);
  });
});

describe('AH · service access', () => {
  it('puts the service yard at the loading dock frontage and runs a vehicle tunnel onto the field', () => {
    const s = fresh(), sy = s.systems, main = s.project.architecture.boh.mainStand;
    const dock = s.architecture.boh.zones.find((z) => z.kind === 'loading')!;
    const expected = dock.seg.length === 1 && dock.seg !== main ? dock.seg : ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[main];
    expect(sy.metrics.service.yard).toBe(expected);
    const yard = sy.zones.filter((z) => z.kind === 'yard');
    expect(yard.length).toBeGreaterThan(0);
    const t = sy.zones.find((z) => z.kind === 'fieldAccess')!;
    expect(t.seg).toBe(s.project.systems.service.fieldAccess);
    expect(t.d1).toBe(s.architecture.facade.d);
    expect(t.d0).toBeLessThan(0);
    const q = clone(s.project); q.systems.service.fieldAccess = 'none'; q.systems.service.yard = 'W';
    const s2 = fresh(q);
    expect(s2.systems.zones.some((z) => z.kind === 'fieldAccess')).toBe(false);
    expect(s2.systems.zones.filter((z) => z.kind === 'yard').every((z) => z.seg === 'W' || z.seg.includes('W'))).toBe(true);
  });
});

describe('AI · v4 files and the Rhino systems layers', () => {
  it('v4 files open as v5 with the default systems and unchanged capacity and floor area', () => {
    for (const [f, total, gfa] of [['generic-nfl', 64578, 81097], ['birmingham', 61626, 38271]] as const) {
      const p = parseProject(readFileSync(`tests/fixtures/v4-${f}.manicai.json`, 'utf8'));
      expect(p.version).toBe(5);
      expect(p.systems).toEqual(defaultProject().systems);
      const s = fresh(p);
      expect([s.metrics.total, Math.round(s.architecture.metrics.grossArea)], f).toEqual([total, gfa]);
    }
  });

  let rh: RhinoModule;
  beforeAll(async () => { rh = await rhino(); });
  it('exports floodlights as aimed blocks and every reservation on its system layer', () => {
    const s = fresh(getPreset('generic-nfl').build()), sy = s.systems;
    const f = inspect3dm(rh, exportRhino(rh, s, { version: 8, seats: false }));
    const on = (l: string) => f.objects.filter((o) => o.layer === l);
    const lights = on('14_LIGHTING::FLOODLIGHTS');
    expect(lights).toHaveLength(sy.fixtures.length);
    expect(lights.every((o) => o.type === 'InstanceReference' && o.block === 'MANICAI_FLOODLIGHT_GENERIC')).toBe(true);
    expect(on('14_LIGHTING::AIMING')).toHaveLength(sy.fixtures.length);
    expect(on('14_LIGHTING::MASTS')).toHaveLength(8);
    expect(on('11_HVAC::RISERS').length + on('12_ELECTRICAL::RISERS').length + on('13_PLUMBING::RISERS').length).toBe(3 * s.building.cores.length);
    expect(on('11_HVAC::AIR_HANDLING')).toHaveLength(sy.zones.filter((z) => z.kind === 'ahu').length);
    expect(on('11_HVAC::DUCT_ZONES')).toHaveLength(sy.bands.filter((b) => b.kind === 'duct').length);
    expect(on('15_AV_IT::VIDEO_BOARDS')).toHaveLength(sy.zones.filter((z) => z.kind === 'board' || z.kind === 'boardFrame').length);
    expect(on('15_AV_IT::BROADCAST::CAMERAS')).toHaveLength(2 * sy.cameras.length);
    expect(on('17_SITE::FIELD_ACCESS')).toHaveLength(1);
    // reservations are exact extrusions of their plan outline, at their levels
    const mast = sy.zones.find((z) => z.kind === 'mast')!;
    const o = f.objects.find((x) => x.name === mast.id)!;
    expect(o.type).toBe('Extrusion');
    expect(o.bbox!.min[2]).toBeCloseTo(mast.z0, 0);
    expect(o.bbox!.max[2]).toBeCloseTo(mast.z1, 0);
    const c = pointAt(s.ring, mast.seg, (mast.u0 + mast.u1) / 2, (mast.d0 + mast.d1) / 2);
    expect((o.bbox!.min[0] + o.bbox!.max[0]) / 2).toBeCloseTo(c.x, -2);
  });
});
