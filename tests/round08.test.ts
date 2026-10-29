/**
 * Round 08 acceptance tests (AX–BB): stability across random designs, repair of damaged files,
 * share links, the preset library and the version stamp.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clearStadiumCache, resolveStadium } from '../src/core/engine/stadium';
import { getPreset, PRESETS } from '../src/core/presets';
import { defaultProject, readProject, SCHEMA_ID, serializeProject, SCHEMA_VERSION, type Project } from '../src/core/schema';
import { decodeShare, encodeShare } from '../src/core/share';
import { carbon } from '../src/studies/carbon';
import { egress } from '../src/studies/egress';
import { viewQuality } from '../src/studies/quality';
import { revenue } from '../src/studies/revenue';
import { pitchSun } from '../src/studies/sun';
import { APP_LABEL, APP_VERSION, saveText, stamped } from '../src/ui/persist';

/** mulberry32, so a failure always reproduces */
function rng(seed: number) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function mutate(p: Project, rnd: () => number) {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const r = () => 0.5 + rnd();
  if (rnd() < 0.5) p.bowl.sideDistance = Math.round(p.bowl.sideDistance * r());
  if (rnd() < 0.5) p.bowl.endDistance = Math.round(p.bowl.endDistance * r());
  if (rnd() < 0.4) p.bowl.cornerRadius = pick([0, 2000, Math.round(p.bowl.cornerRadius * r()), 60000]);
  if (rnd() < 0.3) p.seating.seatWidth = pick([450, 500, 600]);
  if (rnd() < 0.3) p.seating.maxSeatsBetweenAisles = pick([8, 28, 40]);
  if (rnd() < 0.3) p.sightlines.mode = pick(['cvalue', 'riser'] as const);
  if (rnd() < 0.15) p.tiers = p.tiers.slice(0, 1);
  for (const t of p.tiers) {
    if (rnd() < 0.4) t.rows = pick([0, 1, 5, Math.round(t.rows * r()), 60]);
    if (rnd() < 0.2) t.vomitories.enabled = !t.vomitories.enabled;
  }
  if (rnd() < 0.15) { p.field.length = pick([60000, 140000]); p.field.width = pick([40000, 90000]); }
  if (rnd() < 0.4) p.architecture.roof.type = pick(['open', 'canopy', 'perimeter', 'enclosed', 'etfe', 'truss', 'retractable'] as const);
  if (rnd() < 0.3) p.architecture.roof.overhang = pick([-5000, 0, 30000]);
  if (rnd() < 0.3) p.architecture.facade.type = pick(['glazed', 'solid', 'perforated', 'fins'] as const);
  if (rnd() < 0.2) p.site.northDeg = Math.round(rnd() * 360);
  if (rnd() < 0.2) p.site.latitude = pick([-60, 0, 75]);
  if (rnd() < 0.2) p.studies.sun.hour = pick([5, 12, 21]);
}

describe('AX · stability across random designs', () => {
  it('builds 60 random variations of the presets with finite geometry, metrics and studies', () => {
    const rnd = rng(8080);
    const bases = PRESETS.map((x) => x.build());
    const problems: string[] = [];
    for (let k = 0; k < 60; k++) {
      const p = structuredClone(bases[Math.floor(rnd() * bases.length)]);
      mutate(p, rnd);
      clearStadiumCache();
      const s = resolveStadium(p);
      for (const [key, v] of Object.entries(s.metrics)) if (typeof v === 'number' && !Number.isFinite(v)) problems.push(`#${k} metrics.${key}`);
      const t = s.seats.seats;
      for (let i = 0; i < t.count; i++) if (!Number.isFinite(t.x[i] + t.y[i] + t.z[i])) { problems.push(`#${k} seat ${i}`); break; }
      const studies = { quality: viewQuality(s).mean, egress: egress(s).minutes, sun: pitchSun(s).meanHours, carbon: carbon(s).carbon, revenue: revenue(s).annual };
      for (const [key, v] of Object.entries(studies)) if (!Number.isFinite(v)) problems.push(`#${k} ${key}`);
    }
    expect(problems).toEqual([]);
  }, 180_000);
});

describe('AY · damaged files', () => {
  it('opens every preset with nothing repaired', () => {
    for (const x of PRESETS) expect(readProject(serializeProject(x.build())).repaired, x.id).toEqual([]);
  });
  it('resets wrong types and unknown options to the default, lists them, and still builds', () => {
    const raw = JSON.parse(serializeProject(defaultProject()));
    raw.bowl.sideDistance = 'twelve'; raw.tiers[0].rows = null; raw.seating.seatWidth = Infinity;
    raw.sport = 'cricket'; raw.architecture.roof.type = 'zeppelin'; raw.architecture.roof.stands = ['N', 'Q'];
    raw.architecture.facade.portals = 6; raw.tiers[1].kind = 'vip'; raw.studies = 'none';
    const { project, repaired } = readProject(JSON.stringify(raw));
    const d = defaultProject();
    expect(repaired).toEqual(expect.arrayContaining(['bowl.sideDistance', 'tiers[0].rows', 'sport', 'architecture.roof.type', 'architecture.roof.stands', 'architecture.facade.portals', 'tiers[1].kind']));
    expect(project.bowl.sideDistance).toBe(d.bowl.sideDistance);
    expect(project.tiers[0].rows).toBe(d.tiers[0].rows);
    expect(project.sport).toBe(d.sport);
    expect(project.architecture.roof.stands).toEqual(['N']);
    expect(project.studies.sun.month).toBe(d.studies.sun.month);
    expect(resolveStadium(project).metrics.total).toBeGreaterThan(0);
  });
  it('refuses a file from a newer Manica and anything that is not a project', () => {
    expect(() => readProject(JSON.stringify({ ...defaultProject(), version: SCHEMA_VERSION + 1 }))).toThrow(/newer/);
    expect(() => readProject('{"hello":1}')).toThrow(/Not a Manica project/);
  });
});

describe('AZ · share links', () => {
  it('carries a design in the link fragment exactly, in about 2 kB', async () => {
    for (const id of ['generic-soccer', 'milano', 'allegiant']) {
      const p = getPreset(id).build();
      const h = await encodeShare(p);
      expect(h).toMatch(/^project=[A-Za-z0-9_-]+$/);
      expect(h.length).toBeLessThan(2500);
      const back = await decodeShare(`#${h}`);
      expect(back?.project).toEqual(p);
      expect(back?.repaired).toEqual([]);
    }
  });
  it('ignores a fragment without a design and reports a damaged one', async () => {
    expect(await decodeShare('#section')).toBeNull();
    await expect(decodeShare('#project=AAAA')).rejects.toThrow(/damaged/);
  });
});

describe('BA · preset library', () => {
  it('gives an independent copy of each preset every time', () => {
    const a = getPreset('milano').build(), b = getPreset('milano').build();
    expect(a).toEqual(b);
    a.tiers[0].rows = 3; a.bowl.stands.N = { distance: 1 };
    expect(getPreset('milano').build()).toEqual(b);
  });
});

describe('BB · version stamp', () => {
  it('names the app version in saved files and reads them back unchanged', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(APP_VERSION).toBe(pkg.version);
    const p = defaultProject();
    const text = saveText(p);
    const back = readProject(text);
    expect(back.project.saved?.by).toBe(APP_LABEL);
    expect(back.repaired).toEqual([]);
    const { saved, ...rest } = back.project;
    expect(saved).toBeDefined();
    expect(rest).toEqual(p);
    expect(stamped(p).saved?.at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });
});

describe('BC · rename from MANICAI', () => {
  it('opens files saved under the old manicai.project id and re-saves them as manica.project', () => {
    const old = readFileSync('tests/fixtures/v5-generic-nfl.manica.json', 'utf8');
    expect(JSON.parse(old).schema).toBe('manicai.project');
    const p = readProject(old).project;
    expect(p.schema).toBe(SCHEMA_ID);
    expect(JSON.parse(serializeProject(p)).schema).toBe('manica.project');
  });
});
