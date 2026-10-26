/**
 * Round 03 acceptance tests (R–W): premium levels in the section, suites, concourses at the tiers'
 * access levels, program sized from the allowances, cores, closed solids, v2 → v3 migration and
 * the Rhino layers for the building.
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { accessLevel, bandSolid, BALCONY_DEPTH, soffitZ, type BoxMesh } from '../src/core/engine/building';
import { capacityOf } from '../src/core/engine/optimize';
import { enclosedArea, perimeter, segmentLength } from '../src/core/engine/plan';
import { getPreset } from '../src/core/presets';
import { defaultProject, parseProject, suiteLevel, type Project } from '../src/core/schema';
import { exportRhino, type RhinoModule } from '../src/export/rhino';
import { inspect3dm } from '../src/export/inspect3dm';
import { clone, fresh, rhino } from './helpers';

const withSuites = (p: Project = defaultProject(), extra: Parameters<typeof suiteLevel>[2] = {}) => { p.premium = [suiteLevel('P1', 'T2', extra)]; return p; };

/** signed volume of a closed triangle mesh (positive when the faces wind outward) */
function volume(m: BoxMesh) {
  let v = 0;
  const P = m.positions, I = m.index;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  return v;
}

describe('R · premium levels change the section', () => {
  it('lifts the tier above by the level height and sets it back, leaving the tier below alone', () => {
    const a = fresh(defaultProject());
    const p = withSuites(defaultProject(), { height: 4800, setback: 3000 });
    const b = fresh(p);
    expect(b.profiles[0]).toEqual(a.profiles[0]);
    const [t1, t2] = b.profiles;
    expect(t2.bottom).toBe(t1.top + p.tiers[1].elevation + 4800);
    expect(t2.front).toBe(t1.back - p.tiers[1].overhang + 3000);
    expect(t2.bottom - a.profiles[1].bottom).toBe(4800);
    // the upper tier's risers are re-solved for the new position, so it still meets its target where the rake allows
    for (const r of t2.rows.slice(1)) if (!r.capped) expect(r.cGov).toBeGreaterThanOrEqual(60 - 1e-6);
  });

  it('puts the suite glass on the back of the tier below, with a balcony in front, between the concourse and the tier above', () => {
    const s = fresh(withSuites());
    const lv = s.building.levels.find((l) => l.kind === 'suites')!;
    const [t1, t2] = s.profiles;
    expect(lv.z).toBe(t1.top + s.project.tiers[1].elevation);
    expect(lv.d0).toBe(t1.back - BALCONY_DEPTH);
    expect(lv.z + s.project.premium[0].height).toBe(t2.bottom);
    for (const st of s.building.suites) { expect(st.d0).toBe(t1.back); expect(st.z).toBe(lv.z); }
  });

  it('a premium level under the lower tier is reported and not built', () => {
    const p = defaultProject(); p.premium = [suiteLevel('P1', 'T1')];
    const s = fresh(p);
    expect(s.building.suites).toHaveLength(0);
    expect(s.warnings.some((w) => w.code === 'premium.tier')).toBe(true);
    expect(s.profiles[0]).toEqual(fresh(defaultProject()).profiles[0]);
  });
});

describe('S · suites and capacity', () => {
  it('fits whole suites on the chosen stands and counts their seats in the capacity', () => {
    const p = withSuites(defaultProject(), { stands: ['N'], unitWidth: 6000, seatsPerUnit: 12 });
    const s = fresh(p);
    const len = segmentLength(s.ring, 'N', 0);
    const n = Math.floor((len - 4000) / 6000);
    expect(s.building.suites).toHaveLength(n);
    expect(s.building.suites.every((x) => x.seg === 'N')).toBe(true);
    expect(s.metrics.suiteSeats).toBe(n * 12);
    expect(s.metrics.total).toBe(s.metrics.net + n * 12);
    expect(capacityOf(p)).toBe(s.metrics.total);
  });

  it('a club level has no suites and turns its plate behind the balcony into lounge', () => {
    const s = fresh(withSuites(defaultProject(), { kind: 'club' }));
    expect(s.building.suites).toHaveLength(0);
    expect(s.building.metrics.clubLoungeArea).toBeGreaterThan(0);
    expect(s.building.metrics.hospitality).toBe(Math.floor(s.building.metrics.clubLoungeArea / s.project.building.allowances.clubLounge));
  });
});

describe('T · concourses', () => {
  it('serve each tier at its vomitory floor, starting under the tier where the soffit clears', () => {
    const p = defaultProject(); p.tiers[0].vomitories = { enabled: true, every: 2, mouthRow: 10, width: 2800 };
    const s = fresh(p), t = s.profiles[0];
    const c = s.building.levels.find((l) => l.id === 'CONC.T1')!;
    expect(c.z).toBe(t.rows[8].z);
    expect(accessLevel(p, t)).toEqual({ z: t.rows[8].z, under: true });
    expect(c.d0).toBeLessThan(t.back);
    expect(soffitZ(t, c.d0) - c.z).toBeGreaterThanOrEqual(p.building.concourseClear - 1);
    expect(c.circ[1] - c.circ[0]).toBe(p.building.concourseWidth);
  });

  it('without vomitories start behind the tier at its back row', () => {
    const s = fresh(defaultProject()), t = s.profiles[1];
    const c = s.building.levels.find((l) => l.id === 'CONC.T2')!;
    expect(c.z).toBe(t.top);
    expect(c.d0).toBe(t.back);
  });

  it('size the program from the allowances and the spectators each concourse serves', () => {
    const s = fresh(defaultProject()), a = s.project.building.allowances, m = s.building.metrics;
    const served = s.metrics.byTier.reduce((x, t) => x + t.seats, 0);
    expect(m.programNeeded).toBeCloseTo(served * (a.restrooms + a.concessions + a.retail + a.firstAid), 3);
    expect(m.programPlaced).toBeGreaterThan(m.programNeeded * 0.98);
    expect(m.programArea.restrooms).toBeCloseTo(served * a.restrooms, -1);
    // program zones sit in the band behind the concourse
    for (const z of s.building.program) { const l = s.building.levels.find((q) => q.id === z.level)!; expect(z.d0).toBe(l.circ[1]); expect(z.z).toBe(l.z); }
  });

  it('flags program that does not fit the concourse frontage', () => {
    const p = defaultProject(); p.building.allowances.restrooms = 0.5; p.building.programDepth = 3000;
    expect(fresh(p).warnings.some((w) => w.code === 'program.short')).toBe(true);
  });
});

describe('U · cores', () => {
  it('stand outside every floor plate at the set spacing, rising above the top level', () => {
    const p = withSuites();
    const s = fresh(p), B = s.building;
    const outer = Math.max(...B.levels.map((l) => l.d1));
    expect(B.cores.length).toBeGreaterThanOrEqual(4);
    const per = perimeter(s.ring, outer + p.building.cores.depth / 2);
    expect(B.cores.length).toBe(Math.max(4, Math.round(per / p.building.cores.spacing)));
    expect(B.metrics.maxToCore).toBeCloseTo(per / B.cores.length / 2, 3);
    for (const c of B.cores) { expect(c.d0).toBe(outer); expect(c.zTop).toBeGreaterThan(Math.max(...B.levels.map((l) => l.z))); }
    const q = clone(p); q.building.cores.spacing = 30000;
    expect(fresh(q).building.cores.length).toBeGreaterThan(B.cores.length);
  });
});

describe('V · building solids', () => {
  it('are closed and wind outward: a ring plate has the volume of its plan band', () => {
    const s = fresh();
    const m = bandSolid(s.ring, 'ring', 20000, 30000, 5000, 5300);
    const exact = (enclosedArea(s.ring, 30000) - enclosedArea(s.ring, 20000)) * 300;
    expect(volume(m) / exact).toBeGreaterThan(0.995);
    expect(volume(m) / exact).toBeLessThan(1.0001);
    const box = bandSolid(s.ring, { seg: 'N', u0: 0.2, u1: 0.3 }, 1000, 3000, 0, 4000);
    expect(volume(box)).toBeCloseTo(0.1 * segmentLength(s.ring, 'N', 0) * 2000 * 4000, -3);
  });
});

describe('W · v2 files and the Rhino building layers', () => {
  it('v2 files open with no premium levels and their Round 02 capacities', () => {
    for (const [f, gross, net] of [['generic-soccer', 44180, 41998], ['generic-nfl', 67720, 64580]] as const) {
      const p = parseProject(readFileSync(`tests/fixtures/v2-${f}.manicai.json`, 'utf8'));
      expect(p.version).toBe(4);
      expect(p.premium).toEqual([]);
      const m = fresh(p).metrics;
      expect([m.gross, m.net, m.total], f).toEqual([gross, net, net]);
    }
  });

  let rh: RhinoModule;
  beforeAll(async () => { rh = await rhino(); });
  it('exports plates, suites, program and cores, named and on their layers', () => {
    const s = fresh(getPreset('generic-nfl').build());
    const f = inspect3dm(rh, exportRhino(rh, s, { version: 8, seats: false }));
    const on = (l: string) => f.objects.filter((o) => o.layer === l);
    expect(on('05_PREMIUM::SUITES').length).toBe(s.building.suites.length);
    expect(on('05_PREMIUM::SUITES').every((o) => o.type === 'Brep')).toBe(true);
    expect(on('07_VERTICAL_CIRCULATION::CORES').length).toBe(s.building.cores.length);
    expect(on('06_CONCOURSES::FLOOR_PLATES').map((o) => o.name).sort()).toEqual(s.building.levels.filter((l) => l.kind === 'concourse').map((l) => l.id).sort());
    expect(f.objects.filter((o) => o.layer?.startsWith('06_CONCOURSES::PROGRAM::')).length).toBe(s.building.program.length);
  });
});
