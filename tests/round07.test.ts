/**
 * Round 07 acceptance tests (AP–AW): view quality, egress, sun and shade, materials and carbon,
 * revenue, the capacity–proximity explorer, scenario comparison and v5 → v6 files.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPreset } from '../src/core/presets';
import { defaultProject, parseProject, type Project } from '../src/core/schema';
import { carbon, STEEL_DENSITY } from '../src/studies/carbon';
import { egress } from '../src/studies/egress';
import { applyVars, bounds, explore, paretoFront, scoreDesign } from '../src/studies/explore';
import { headTurn, qualityOf, viewQuality } from '../src/studies/quality';
import { revenue } from '../src/studies/revenue';
import { compareCsv, summarize } from '../src/studies/summary';
import { dayOfYear, pitchSun, seatSun, shadeModel, sunPosition, sunVector } from '../src/studies/sun';
import { clone, fresh } from './helpers';

const roofed = (type: Project['architecture']['roof']['type'], material: Project['architecture']['roof']['material'], p: Project = defaultProject()) => {
  p.architecture.roof = { ...p.architecture.roof, type, material };
  return p;
};

describe('AP · view quality', () => {
  it('scores distance, sightline and head turn on their stated scales', () => {
    expect(qualityOf(90_000, 120, 90, 0).quality).toBeCloseTo(1, 9);
    expect(qualityOf(190_000, 0, 90, Math.PI / 2).quality).toBeCloseTo(0, 9);
    const q = qualityOf(145_000, 45, 90, Math.PI / 4);
    expect(q.distance).toBeCloseTo(0.5, 9); expect(q.sightline).toBeCloseTo(0.5, 9); expect(q.turn).toBeCloseTo(0.5, 9);
    expect(q.quality).toBeCloseTo(0.5, 9);
    // a seat on the +X axis facing −X looks straight at the centre spot
    expect(headTurn(50_000, 0, Math.PI)).toBeCloseTo(0, 9);
    expect(headTurn(50_000, 0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('rates every seat in use, recomputed independently, and sums the histogram to net capacity', () => {
    const s = fresh(), r = viewQuality(s), t = s.seats.seats;
    expect(r.histogram.reduce((a, b) => a + b, 0)).toBe(s.metrics.net);
    let sum = 0, n = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.status[i] !== 0) { expect(Number.isNaN(r.score[i])).toBe(true); continue; }
      const target = s.project.tiers[t.tier[i]].targetC ?? s.project.sightlines.targetC;
      const dist = Math.max(0, Math.min(1, (190_000 - t.distFar[i]) / 90_000)), sl = Math.max(0, Math.min(1, t.cValue[i] / target));
      const a = Math.atan2(-t.y[i], -t.x[i]) - t.rot[i], turn = Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / (Math.PI / 2));
      sum += 0.5 * dist + 0.3 * sl + 0.2 * turn; n++;
    }
    expect(r.mean).toBeCloseTo(sum / n, 5);
    // bringing the stands in improves the distance term
    const q = clone(s.project); q.bowl.sideDistance -= 2000; q.bowl.endDistance -= 2000;
    expect(viewQuality(fresh(q)).terms.distance).toBeGreaterThan(r.terms.distance);
  });
});

describe('AQ · egress', () => {
  it('sends every seat in use to one exit and clears each exit at width × rate', () => {
    const s = fresh(), e = egress(s), E = s.project.studies.egress;
    expect(e.exits.reduce((a, x) => a + x.seats, 0)).toBe(s.metrics.net);
    for (const x of e.exits) expect(x.minutes).toBeCloseTo(x.seats / ((x.width / 1000) * E.stepRate), 9);
    expect(e.minutes).toBeCloseTo(Math.max(...e.exits.map((x) => x.minutes)), 9);
    // vomitory tiers leave by their vomitories
    s.profiles.forEach((_, ti) => { if (s.seats.vomitories.some((v) => v.tier === ti)) expect(e.byTier[ti].kind).toBe('vomitories'); });
    const t = s.seats.seats;
    for (let i = 0; i < t.count; i++) if (t.status[i] === 0) expect(e.travel[i]).toBeGreaterThanOrEqual(0);
  });

  it('halves the time at twice the rate and gets faster with more vomitories', () => {
    const p = getPreset('single-end').build(), s = fresh(p), e = egress(s);
    const q = clone(p); q.studies.egress.stepRate *= 2;
    expect(egress(fresh(q)).minutes).toBeCloseTo(e.minutes / 2, 6);
    const v = clone(p); v.tiers.forEach((t) => { if (t.vomitories.enabled) t.vomitories.every = 1; });
    expect(egress(fresh(v)).minutes).toBeLessThan(e.minutes);
    // the big single-tier end of this preset is slower than the 8-minute default and is reported
    expect(e.ok).toBe(false);
  });
});

describe('AR · sun and shade', () => {
  it('puts the sun where the solar geometry says', () => {
    const eq = sunPosition(40, dayOfYear(3, 21), 12);
    expect(eq.altitude).toBeCloseTo(50, 0); expect(eq.azimuth).toBeCloseTo(180, 6);
    const jun = sunPosition(51.5, dayOfYear(6, 21), 12);
    expect(jun.altitude).toBeCloseTo(90 - 51.5 + 23.44, 0);
    const am = sunPosition(40, 80, 9), pm = sunPosition(40, 80, 15);
    expect(am.azimuth).toBeLessThan(180); expect(pm.azimuth).toBeGreaterThan(180);
    expect(am.altitude).toBeCloseTo(pm.altitude, 6);
    // default site north (+X east): the noon sun lies toward −Y (south)
    const v = sunVector(90, eq.altitude, eq.azimuth);
    expect(v[0]).toBeCloseTo(0, 6); expect(v[1]).toBeLessThan(0);
  });

  it('lights the centre spot at noon in the open, blocks it under metal and filters it through ETFE', () => {
    const at = (p: Project) => { const s = fresh(p); const S = p.studies.sun; const sp = sunPosition(40, dayOfYear(S.month, S.day), 12); return shadeModel(s).sunAt(0, 0, 0, sunVector(p.site.northDeg, sp.altitude, sp.azimuth)); };
    expect(at(roofed('open', 'ptfe'))).toBe(1);
    expect(at(roofed('enclosed', 'metal'))).toBe(0);
    expect(at(roofed('etfe', 'etfe'))).toBeCloseTo(0.85, 9);
  });

  it('shades the pitch less with a lower bowl, and turns with site north', () => {
    const p = roofed('open', 'ptfe'), r = pitchSun(fresh(p));
    expect(r.daylight).toBe(12);
    expect(r.meanHours).toBeLessThanOrEqual(r.daylight);
    const low = clone(p); low.tiers = low.tiers.slice(0, 1); low.tiers[0].rows = 10;
    expect(pitchSun(fresh(low)).meanHours).toBeGreaterThan(r.meanHours);
    // turning the site 180° mirrors the pitch through its centre (the bowl is symmetric)
    const q = clone(p); q.site.northDeg = 270;
    const r2 = pitchSun(fresh(q)), { nx, ny } = r.grid;
    let worst = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) worst = Math.max(worst, Math.abs(r.grid.hours[j * nx + i] - r2.grid.hours[(ny - 1 - j) * nx + (nx - 1 - i)]));
    expect(worst).toBeLessThanOrEqual(0.5);
    // seats: every seat in use gets a value, and none at night
    const night = clone(p); night.studies.sun.hour = 21;
    expect(seatSun(fresh(night)).inSun).toBe(0);
  });
});

describe('AS · materials and carbon', () => {
  it('turns each quantity into carbon with the stated factors', () => {
    const s = fresh(), c = carbon(s), C = s.project.studies.carbon;
    for (const l of c.lines) {
      const want = ((l.concrete ?? 0) * C.concrete + (l.rebar ?? 0) * C.rebar + (l.steel ?? 0) * C.steel) / 1000 + (l.item === 'Roof covering' ? (l.area! * C.roofCovering) / 1000 : 0) + (l.item === 'Facade' ? (l.area! * C.facade) / 1000 : 0);
      expect(l.carbon, l.item).toBeCloseTo(want, 6);
      if (l.concrete) expect(l.rebar).toBeCloseTo(l.concrete * C.rebarRate, 6);
    }
    const terr = c.lines[0];
    expect(terr.concrete).toBeCloseTo((s.metrics.bowlArea / 1e6) * (C.terraceThickness / 1000), 6);
    expect(c.carbon).toBeCloseTo(c.lines.reduce((a, l) => a + l.carbon, 0), 6);
    expect(c.low).toBeCloseTo(c.carbon * (1 - C.uncertainty), 6);
    expect(c.perSeat).toBeCloseTo((c.carbon * 1000) / s.metrics.total, 6);
    const roof = c.lines.find((l) => l.item === 'Roof structure (steel)')!;
    expect(roof.steel).toBeCloseTo(s.architecture.metrics.roofPlan * C.roofSteel, 6);
  });

  it('switches the frame between steel and concrete', () => {
    const p = defaultProject(), steel = carbon(fresh(p)).lines.find((l) => l.item.startsWith('Rakers'))!;
    const q = clone(p); q.architecture.structure.material = 'concrete';
    const conc = carbon(fresh(q)).lines.find((l) => l.item.startsWith('Rakers'))!;
    expect(steel.steel! / STEEL_DENSITY / p.studies.carbon.steelFraction).toBeCloseTo(conc.concrete!, 3);
  });
});

describe('AT · revenue', () => {
  it('adds gate, club and suite income from the seat mix', () => {
    const s = fresh(getPreset('generic-nfl').build()), r = revenue(s), R = s.project.studies.revenue, m = s.metrics;
    const club = m.byClass.premium ?? 0;
    const want = (m.net - club) * R.ticket * R.events * R.occupancy + club * R.club * R.events * R.occupancy + s.building.metrics.suites * R.suite;
    expect(r.annual).toBeCloseTo(want, 3);
    expect(r.scenarios.map((x) => x.name)).toEqual(['Low', 'Base', 'High']);
    expect(r.scenarios[1].annual).toBeCloseTo(r.annual, 3);
    expect(r.scenarios[0].annual).toBeLessThan(r.scenarios[2].annual);
    expect(r.premium).toBeGreaterThan(0);
  });
});

describe('AU · capacity against proximity', () => {
  const p = getPreset('horseshoe').build();
  const r = explore(p, { initial: 12, generations: 1, perGeneration: 8, targetGenerations: 1 });

  it('starts from the current design and keeps a feasible, non-dominated front', () => {
    expect(r.candidates[0].changes).toEqual(['the current design']);
    expect(r.candidates[0].capacity).toBe(fresh(p).metrics.total);
    expect(r.front.length).toBeGreaterThan(0);
    for (const i of r.front) {
      const a = r.candidates[i];
      expect(a.feasible).toBe(true);
      for (const b of r.candidates) if (b.feasible) expect(b.capacity > a.capacity && b.meanCentre < a.meanCentre).toBe(false);
    }
    expect(paretoFront(r.candidates)).toEqual(r.front);
  });

  it('regenerates candidates for real, never inside the run-off, and is repeatable', () => {
    const B = bounds(p);
    for (const c of r.candidates) {
      expect(c.vars.side).toBeGreaterThanOrEqual(B.side[0]); expect(c.vars.end).toBeGreaterThanOrEqual(B.end[0]);
      expect(c.project.bowl.sideDistance).toBeGreaterThanOrEqual(p.field.runoffSide);
    }
    const c = r.candidates[r.recommended];
    const s = fresh(applyVars(p, c.vars));
    expect(s.metrics.total).toBe(c.capacity);
    expect(s.metrics.viewing.meanCentre).toBeCloseTo(c.meanCentre, 3);
    expect(scoreDesign(c.project).capacity).toBe(c.capacity);
    const again = explore(p, { initial: 12, generations: 1, perGeneration: 8, targetGenerations: 1 });
    expect(again.candidates.map((x) => x.capacity)).toEqual(r.candidates.map((x) => x.capacity));
  });

  it('flags designs that break the minimum C-value', () => {
    const q = clone(p); q.tiers[0].targetC = 20; q.sightlines.minC = 60;
    const sc = scoreDesign(q);
    expect(sc.feasible).toBe(false);
    expect(sc.breaks.join()).toMatch(/C-value/);
  }, 30_000);
});

describe('AV · scenario comparison', () => {
  it('summarises a design with every study and writes a comparison CSV', () => {
    const a = summarize(fresh()), b = summarize(fresh(getPreset('four-stand').build()));
    expect(a.map((r) => r.key)).toEqual(b.map((r) => r.key));
    expect(a.find((r) => r.key === 'capacity')!.value).toBe(fresh().metrics.total);
    const csv = compareCsv(['A', 'B'], [a, b]).trim().split('\n');
    expect(csv[1]).toBe('group,metric,better,A,B');
    expect(csv.length).toBe(a.length + 2);
  });
});

describe('AW · v5 files', () => {
  it('v5 files open as v6 with the default studies and unchanged capacity and floor area', () => {
    for (const [f, total, gfa] of [['generic-nfl', 64578, 81097], ['milano', 71398, 49585]] as const) {
      const p = parseProject(readFileSync(`tests/fixtures/v5-${f}.manica.json`, 'utf8'));
      expect(p.version).toBe(6);
      expect(p.studies).toEqual(defaultProject().studies);
      const s = fresh(p);
      expect([s.metrics.total, Math.round(s.architecture.metrics.grossArea)], f).toEqual([total, gfa]);
    }
  });
});
