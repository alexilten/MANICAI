/**
 * Round 01 acceptance tests A–G and J from the master brief (H is in export.test.ts, I in bench.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { countSeats } from '../src/core/engine/seats';
import { EYE_FROM_BACK } from '../src/core/engine/profile';
import { planOffset, SECTORS } from '../src/core/engine/plan';
import { RULE, RULES } from '../src/core/data/standards';
import { PRESETS } from '../src/core/presets';
import { defaultProject, parseProject, serializeProject, switchSport, tier } from '../src/core/schema';
import { SPORTS } from '../src/core/sports';
import { ft, m } from '../src/core/units';
import { seatsCsv } from '../src/export/csv';
import { clone, fresh } from './helpers';

describe('A · origin and sport switching', () => {
  it('puts the field centre at the world origin for both sports', () => {
    for (const sport of ['soccer', 'nfl'] as const) {
      const p = defaultProject();
      switchSport(p, sport);
      const s = fresh(p);
      const b = s.field.boundary;
      expect(b.minX).toBeCloseTo(-b.maxX, 6);
      expect(b.minY).toBeCloseTo(-b.maxY, 6);
      expect(b.maxX - b.minX).toBeCloseTo(s.field.length, 6); // X is field length
      expect(b.maxY - b.minY).toBeCloseTo(s.field.width, 6);
      const centre = s.field.landmarks.CENTRE_MARK ?? s.field.landmarks.MIDFIELD;
      expect(centre).toEqual([0, 0, 0]);
      // the bowl is symmetric about the origin too
      expect(s.bounds.min[0]).toBeCloseTo(-s.bounds.max[0], 6);
      expect(s.bounds.min[1]).toBeCloseTo(-s.bounds.max[1], 6);
    }
  });

  it('switches soccer → NFL → soccer and regenerates field, bowl and seats', () => {
    const p = defaultProject();
    const a = fresh(clone(p));
    switchSport(p, 'nfl');
    const b = fresh(clone(p));
    expect(b.field.sport).toBe('nfl');
    expect(b.ring.sideDistance).toBe(SPORTS.nfl.defaults.sideDistance);
    expect(b.metrics.gross).not.toBe(a.metrics.gross);
    switchSport(p, 'soccer');
    const c = fresh(clone(p));
    expect(c.field.length).toBe(a.field.length);
    expect(c.metrics.gross).toBe(a.metrics.gross);
  });

  it('keeps north as a site parameter that never moves geometry', () => {
    const p = defaultProject();
    const a = fresh(clone(p));
    p.site.northDeg = 17;
    const b = fresh(clone(p));
    expect(Array.from(b.seats.seats.x.slice(0, 500))).toEqual(Array.from(a.seats.seats.x.slice(0, 500)));
  });
});

describe('B · field dimensions', () => {
  it('builds a 105 × 68 m soccer pitch with IFAB Law 1 markings', () => {
    const s = fresh();
    expect(s.field.length).toBe(m(105));
    expect(s.field.width).toBe(m(68));
    const pm = s.field.landmarks.PENALTY_MARK_E;
    expect(pm[0]).toBeCloseTo(m(105) / 2 - 11000, 6); // penalty mark 11 m from the goal line
    const surf = s.field.surface;
    expect(surf.maxX - s.field.boundary.maxX).toBeCloseTo(m(7.5), 6);
    expect(surf.maxY - s.field.boundary.maxY).toBeCloseTo(m(6), 6);
  });

  it('builds a 360 × 160 ft NFL field with 10-yard end zones', () => {
    const p = defaultProject(); switchSport(p, 'nfl');
    const s = fresh(p);
    expect(s.field.length).toBeCloseTo(ft(360), 6);
    expect(s.field.width).toBeCloseTo(ft(160), 6);
    expect(s.field.landmarks.GOAL_LINE_E[0]).toBeCloseTo(ft(150), 6); // 50 yd from midfield
    const ez = s.field.zones.filter((z) => z.kind === 'endzone');
    expect(ez).toHaveLength(2);
    for (const z of ez) expect(z.rect.maxX - z.rect.minX).toBeCloseTo(ft(30), 6);
  });

  it('respects the sport limits the UI exposes', () => {
    expect(SPORTS.soccer.limits.length).toEqual([m(100), m(110)]);
    expect(SPORTS.nfl.limits.fixed).toBe(true);
  });
});

describe('C · seat count is the data', () => {
  it('reports exactly the seats that exist, by tier, sector and CSV row', () => {
    const s = fresh();
    const t = s.seats.seats, n = t.count;
    let active = 0;
    for (let i = 0; i < n; i++) if (t.status[i] === 0) active++;
    expect(s.metrics.gross).toBe(n);
    expect(s.metrics.net).toBe(active);
    const c = countSeats(s.project, s.ring, s.profiles, s.layout.rows, { focus: s.field.boundary, fieldLW: [s.field.length, s.field.width] });
    expect(c.gross).toBe(n);
    expect(c.net).toBe(active);
    expect(s.metrics.net + s.metrics.exclusions.reduce((a, x) => a + x.seats, 0)).toBe(n);
    expect(s.metrics.byTier.reduce((a, t) => a + t.seats, 0)).toBe(active);
    expect(s.metrics.byTier.reduce((a, t) => a + t.gross, 0)).toBe(n);
    expect(SECTORS.reduce((a, k) => a + s.metrics.bySector[k], 0)).toBe(active);
    expect(s.seats.sections.reduce((a, x) => a + x.seats, 0)).toBe(n);
    expect(s.seats.sections.reduce((a, x) => a + x.net, 0)).toBe(active);
    const csv = seatsCsv(s).trim().split('\n');
    expect(csv.length - 1).toBe(n);
  });

  it('gives every seat a unique id and keeps aisle runs within the limit', () => {
    const s = fresh();
    const t = s.seats.seats;
    const ids = new Set<string>();
    for (let i = 0; i < t.count; i++) ids.add(`${t.tier[i]}-${t.section[i]}-${t.row[i]}-${t.number[i]}`);
    expect(ids.size).toBe(t.count);
    expect(s.metrics.maxRowSeats).toBeLessThanOrEqual(s.project.seating.maxSeatsBetweenAisles);
  });

  it('never places a seat closer than the first-row line or on the field', () => {
    const s = fresh();
    const t = s.seats.seats;
    for (let i = 0; i < t.count; i += 7) expect(planOffset(s.ring, t.x[i], t.y[i])).toBeGreaterThan(0);
  });
});

describe('D · row depth, first row and riser', () => {
  it('row depth sets the nosing spacing and the plan depth', () => {
    const p = defaultProject(); p.sightlines.mode = 'riser';
    const a = fresh(clone(p));
    p.tiers[0].rowDepth = 900;
    const b = fresh(clone(p));
    const r = b.profiles[0].rows;
    for (let i = 1; i < r.length; i++) expect(r[i].d - r[i - 1].d).toBeCloseTo(900, 6);
    expect(b.profiles[0].back - a.profiles[0].back).toBeCloseTo(100 * p.tiers[0].rows, 6);
  });

  it('first-row distance moves the whole bowl', () => {
    const p = defaultProject();
    p.bowl.sideDistance = 6000;
    const a = fresh(clone(p));
    p.bowl.sideDistance = 12000;
    const b = fresh(clone(p));
    expect(b.ring.hy - a.ring.hy).toBeCloseTo(6000, 6);
    expect(b.metrics.footprint.width - a.metrics.footprint.width).toBeGreaterThan(12000 - 1);
  });

  it('first-row elevation sets the first tread level', () => {
    const p = defaultProject(); p.tiers[0].elevation = 2200;
    expect(fresh(p).profiles[0].rows[0].z).toBe(2200);
  });

  it('a constant riser gives a constant rake', () => {
    const p = defaultProject(); p.sightlines.mode = 'riser'; p.tiers[0].riser = 420;
    const r = fresh(p).profiles[0].rows;
    for (let i = 1; i < r.length; i++) expect(r[i].z - r[i - 1].z).toBe(420);
  });

  it('C-value mode rounds risers up to the step and never exceeds the rake limit', () => {
    const s = fresh();
    const step = s.project.sightlines.riserStep;
    const tanMax = Math.tan((s.project.sightlines.maxRakeDeg * Math.PI) / 180);
    for (const t of s.profiles) for (const r of t.rows.slice(1)) {
      expect(r.riser % step).toBe(0);
      expect(r.riser).toBeLessThanOrEqual(t.rowDepth * tanMax + 1e-6);
    }
  });
});

describe('E · C-values against an independent reference', () => {
  /** Plain geometry, written separately from the engine: the sightline from an eye to the focus
   *  point, and how far it clears the eye of the spectator in front. */
  const clearance = (De: number, Ze: number, Dp: number, Zp: number) => (Ze * Dp) / De - Zp;

  it('matches the textbook definition row by row on the sideline stand', () => {
    const s = fresh();
    for (const t of s.profiles) {
      const D0 = s.ring.sideDistance;
      for (let i = 1; i < t.rows.length; i++) {
        const r = t.rows[i], q = t.rows[i - 1];
        const ref = clearance(D0 + r.eyeD, r.eyeZ, D0 + q.eyeD, q.eyeZ);
        expect(r.cSide).toBeCloseTo(ref, 6);
      }
    }
  });

  it('meets the 90 mm lower-tier target wherever the rake was not capped', () => {
    const s = fresh();
    for (const r of s.profiles[0].rows.slice(1)) if (!r.capped) expect(Math.min(r.cSide, r.cEnd, r.cCorner)).toBeGreaterThanOrEqual(90 - 1e-6);
  });

  it('per-seat C at mid-sideline equals the section value', () => {
    const s = fresh();
    const t = s.seats.seats;
    let checked = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.tier[i] !== 0 || t.y[i] <= 0 || Math.abs(t.x[i]) > 400 || t.row[i] < 2) continue;
      const row = s.profiles[0].rows[t.row[i] - 1];
      expect(t.cValue[i]).toBeCloseTo(row.cSide, 0);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('eye point sits 400 mm in front of the riser behind at 1200 mm', () => {
    const r = fresh().profiles[0].rows[3];
    expect(r.eyeD).toBe(r.d + 800 - EYE_FROM_BACK);
    expect(r.eyeZ).toBe(r.z + 1200);
  });
});

describe('F · tier relationships', () => {
  it('stacks each tier on the one below with its gap and overhang', () => {
    const s = fresh();
    const [a, b] = s.profiles, t2 = s.project.tiers[1];
    expect(b.bottom).toBe(a.top + t2.elevation);
    expect(b.front).toBe(a.back - t2.overhang);
    expect(b.headroomBelow).toBe(b.bottom - 1500 - a.top);
  });

  it('flags an upper tier with too little headroom', () => {
    const p = defaultProject(); p.tiers[1].elevation = 3000;
    expect(fresh(p).warnings.some((w) => w.code === 'tier.headroom')).toBe(true);
    const ok = defaultProject();
    expect(fresh(ok).warnings.some((w) => w.code === 'tier.headroom')).toBe(false);
  });

  it('adds and removes tiers', () => {
    const p = defaultProject();
    p.tiers.push(tier('T3', 'Top tier', { rows: 12, elevation: 4500, overhang: -3000, targetC: 60 }));
    const s = fresh(p);
    expect(s.profiles).toHaveLength(3);
    expect(s.metrics.byTier[2].seats).toBeGreaterThan(0);
    p.tiers = p.tiers.slice(0, 1);
    expect(fresh(p).profiles).toHaveLength(1);
  });
});

describe('G · save / load', () => {
  it('round-trips a project to identical geometry and metrics', () => {
    for (const pr of PRESETS.slice(0, 4)) {
      const p = pr.build();
      const a = fresh(clone(p));
      const q = parseProject(serializeProject(p));
      expect(q).toEqual(p);
      const b = fresh(q);
      expect(b.metrics).toEqual(a.metrics);
      expect(Array.from(b.seats.seats.z)).toEqual(Array.from(a.seats.seats.z));
    }
  });

  it('refuses files that are not Manica projects or come from a newer version', () => {
    expect(() => parseProject('{"schema":"stagework.project","version":1}')).toThrow();
    const p = JSON.parse(serializeProject(defaultProject())); p.version = 99;
    expect(() => parseProject(JSON.stringify(p))).toThrow(/newer/);
  });
});

describe('J · assumptions stay visible', () => {
  it('every preset says what it assumed, precedent presets say what is published', () => {
    for (const p of PRESETS) {
      expect(p.assumed.length).toBeGreaterThan(0);
      if (p.category === 'precedent') { expect(p.verified.length).toBeGreaterThan(0); expect(p.precedent).toBeTruthy(); }
    }
  });

  it('every standard is tagged with its kind and how it was verified, and every reference resolves', () => {
    for (const r of RULES) { expect(r.kind).toBeTruthy(); expect(r.verification).toBeTruthy(); expect(r.source).toBeTruthy(); }
    for (const sport of ['soccer', 'nfl'] as const) {
      const p = defaultProject(); switchSport(p, sport);
      const s = fresh(p);
      for (const id of s.field.sources) expect(RULE[id], id).toBeDefined();
      for (const w of s.warnings) if (w.rule) expect(RULE[w.rule], w.rule).toBeDefined();
    }
  });

  it('always states the scope limits', () => {
    expect(fresh().warnings.some((w) => w.code === 'scope.r03')).toBe(true);
  });

  it('fits every preset to within 2% of its published capacity (bowl net + suites) and meets the ADA wheelchair count', () => {
    for (const pr of PRESETS) {
      const p = pr.build();
      const m = fresh(p).metrics;
      expect(Math.abs(m.total - p.bowl.targetCapacity) / p.bowl.targetCapacity, pr.id).toBeLessThan(0.02);
      expect(m.accessible.wheelchair, pr.id).toBeGreaterThanOrEqual(m.accessible.required);
    }
  });
});
