/**
 * Round 02 acceptance tests (K–Q): independent stands, per-region rows, cross-aisles, vomitories,
 * accessible positions, net vs gross capacity, capacity suggestions and v1 → v2 migration.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaRequired } from '../src/core/engine/accessibility';
import { suggestMoves } from '../src/core/engine/optimize';
import type { SegmentId } from '../src/core/engine/plan';
import { platformRaise, VOM_CLEAR, type SeatTable } from '../src/core/engine/seats';
import type { Stadium } from '../src/core/engine/stadium';
import { defaultProject, parseProject, type Project } from '../src/core/schema';
import { fresh } from './helpers';

/** the plan region each seat sits in, from the section table */
function segOf(s: Stadium): (i: number) => SegmentId {
  const m = new Map(s.seats.sections.map((x) => [`${x.tier}.${x.section}`, x.segment]));
  const t = s.seats.seats;
  return (i) => m.get(`${t.tier[i]}.${t.section[i]}`)!;
}
const maxRow = (t: SeatTable, keep: (i: number) => boolean) => { let r = 0; for (let i = 0; i < t.count; i++) if (keep(i)) r = Math.max(r, t.row[i]); return r; };
/** a bare bowl: no vomitories or accessible positions, so seat positions are easy to reason about */
const bare = (): Project => { const p = defaultProject(); p.tiers.forEach((t) => { t.accessible.perSection = 0; }); return p; };

describe('K · independent stands', () => {
  it('moves only the stand whose distance changes', () => {
    const a = fresh(bare());
    const p = bare(); p.bowl.stands = { N: { distance: 15000 } };
    const b = fresh(p);
    expect(b.ring.dist.N).toBe(15000);
    expect(b.ring.dist.S).toBe(a.ring.dist.S);
    expect(b.ring.dist.E).toBe(a.ring.dist.E);
    expect(b.ring.dist.W).toBe(a.ring.dist.W);
    // first-row seats on the stand centrelines: north moved out by 7 m, south unchanged
    const edge = (s: Stadium, north: boolean) => { const t = s.seats.seats; let v = Infinity; for (let i = 0; i < t.count; i++) if (Math.abs(t.x[i]) < 2000 && (t.y[i] > 0) === north && t.tier[i] === 0) v = Math.min(v, Math.abs(t.y[i])); return v; };
    expect(edge(b, true) - edge(a, true)).toBeCloseTo(7000, 0);
    expect(edge(b, false)).toBeCloseTo(edge(a, false), 6);
  });

  it('an open end has no seats, and the corners beside it follow it', () => {
    const p = bare(); p.bowl.stands = { E: { open: true } };
    const s = fresh(p);
    for (const g of ['E', 'NE', 'SE'] as SegmentId[]) expect(s.metrics.bySegment[g], g).toBe(0);
    expect(s.metrics.bySegment.W).toBeGreaterThan(0);
    const t = s.seats.seats;
    for (let i = 0; i < t.count; i++) expect(t.x[i]).toBeLessThan(s.field.length / 2 + s.ring.dist.E);
    expect(s.metrics.gross).toBeLessThan(fresh(bare()).metrics.gross);
  });

  it('runs one tier deeper in one stand only where no tier sits above it', () => {
    const clampP = bare(); clampP.bowl.stands = { W: { rows: { T1: 40 } } };
    const c = fresh(clampP);
    expect(c.layout.rows.W[0]).toBe(clampP.tiers[0].rows);
    expect(c.warnings.some((w) => w.code === 'stand.clamped')).toBe(true);

    const p = bare(); p.bowl.stands = { W: { rows: { T1: 40, T2: 0 } } };
    const s = fresh(p), seg = segOf(s), t = s.seats.seats;
    expect(maxRow(t, (i) => t.tier[i] === 0 && seg(i) === 'W')).toBe(40);
    expect(maxRow(t, (i) => t.tier[i] === 0 && seg(i) === 'E')).toBe(p.tiers[0].rows);
    expect(maxRow(t, (i) => t.tier[i] === 1 && seg(i) === 'W')).toBe(0);
    expect(s.profiles[0].rows.length).toBeGreaterThanOrEqual(40);
  });
});

describe('L · cross-aisles', () => {
  it('widens the tread behind the row and solves the next riser over the wider gap', () => {
    const p = bare(); p.tiers[0].crossAisles = [10];
    const s = fresh(p), r = s.profiles[0].rows, d = p.tiers[0].rowDepth;
    expect(r[10].d - r[9].d).toBe(d + p.seating.crossAisleWidth);
    expect(r[9].d - r[8].d).toBe(d);
    expect(r[10].eyeD - r[9].eyeD).toBe(d + p.seating.crossAisleWidth);
    // the row behind the aisle still meets its target where the rake allows
    if (!r[10].capped) expect(r[10].cGov).toBeGreaterThanOrEqual(90 - 1e-6);
    // the whole tier is deeper by the aisle width
    expect(s.profiles[0].back - fresh(bare()).profiles[0].back).toBe(p.seating.crossAisleWidth);
  });
});

describe('M · vomitories', () => {
  const p = bare(); p.tiers[0].vomitories = { enabled: true, every: 2, mouthRow: 8, width: 2800 };
  const s = fresh(p);

  it('removes rows from the mouth until the treads clear the tunnel', () => {
    expect(s.seats.vomitories.length).toBeGreaterThan(0);
    const rows = s.profiles[0].rows;
    for (const v of s.seats.vomitories) {
      const m0 = 7, m1 = m0 + v.rowsRemoved;
      expect(v.zFloor).toBe(rows[m0 - 1].z);
      for (let k = m0; k < m1; k++) expect(rows[k].z - v.zFloor).toBeLessThan(VOM_CLEAR);
      if (m1 < p.tiers[0].rows) expect(rows[m1].z - v.zFloor).toBeGreaterThanOrEqual(VOM_CLEAR);
    }
  });

  it('puts one in every second section and takes its seats out of net capacity', () => {
    const t1 = s.seats.sections.filter((x) => x.tier === 0);
    expect(s.seats.vomitories.length).toBe(Math.ceil(t1.length / 2));
    const t = s.seats.seats;
    let vom = 0;
    for (let i = 0; i < t.count; i++) if (t.status[i] === 1) { vom++; expect(t.tier[i]).toBe(0); expect(t.row[i]).toBeGreaterThanOrEqual(8); }
    expect(vom).toBe(s.metrics.exclusions.find((x) => x.status === 'vomitory')!.seats);
    expect(s.metrics.net).toBe(s.metrics.gross - vom);
    expect(s.metrics.gross).toBe(fresh(bare()).metrics.gross);
  });
});

describe('N · accessible positions', () => {
  it('places wheelchair spaces with companions on the platform row and removes the seats they replace', () => {
    const p = bare(); p.tiers[0].accessible = { perSection: 2, row: 10 };
    const s = fresh(p), t = s.seats.seats;
    const sections = s.seats.sections.filter((x) => x.tier === 0).length;
    let wc = 0, comp = 0, plat = 0;
    for (let i = 0; i < t.count; i++) {
      if (t.status[i] === 0 && t.cls[i] === 2) { wc++; expect(t.row[i]).toBe(10); }
      if (t.status[i] === 0 && t.cls[i] === 3) { comp++; expect(t.row[i]).toBe(10); }
      if (t.status[i] === 2) { plat++; expect([10, 11]).toContain(t.row[i]); }
    }
    expect(wc).toBe(sections * 2);
    expect(comp).toBe(wc);
    const K = Math.ceil(1400 / p.seating.seatWidth);
    expect(plat).toBe(wc * (K - 2) + wc * K);
    expect(s.metrics.accessible.wheelchair).toBe(wc);
  });

  it('raises the platform so the wheelchair eye matches the seated eye', () => {
    const p = bare(); p.tiers[0].accessible = { perSection: 1, row: 10 };
    const s = fresh(p), t = s.seats.seats, row = s.profiles[0].rows[9];
    for (let i = 0; i < t.count; i++) if (t.cls[i] === 2) expect(t.z[i]).toBe(row.z + platformRaise(p));
    expect(platformRaise(p)).toBe(50);
  });

  it('encodes the ADA 221.2.1.1 table', () => {
    expect([25, 50, 150, 300, 500, 1000, 5000, 5001, 42000].map(adaRequired)).toEqual([1, 2, 4, 5, 6, 10, 36, 37, 221]);
  });
});

describe('O · net vs gross', () => {
  it('can exclude seats below the minimum C-value', () => {
    // a rake limit low enough that the upper tier cannot reach the minimum everywhere
    const p = bare(); p.sightlines.maxRakeDeg = 24;
    const a = fresh(p);
    p.sightlines.excludeBelowMin = true;
    const b = fresh(p);
    const below = b.metrics.exclusions.find((x) => x.status === 'sightline')!.seats;
    expect(below).toBeGreaterThan(0);
    expect(b.metrics.gross).toBe(a.metrics.gross);
    expect(b.metrics.net).toBe(a.metrics.net - below);
    expect(b.metrics.c.min).toBeGreaterThanOrEqual(p.sightlines.minC - 0.5);
  });
});

describe('P · capacity suggestions', () => {
  it('suggests moves that close the gap, and flags the ones that break a rule', () => {
    const p = defaultProject(); p.bowl.targetCapacity = 50000;
    const now = fresh(p).metrics.net;
    const moves = suggestMoves(p);
    expect(moves.length).toBeGreaterThan(0);
    const best = moves[0];
    expect(best.delta).toBeGreaterThan(0);
    expect(best.breaks).toEqual([]);
    const q = structuredClone(p); best.apply(q);
    expect(fresh(q).metrics.net).toBe(best.capacity);
    expect(best.capacity - now).toBe(best.delta);
    // a seat-width cut below the Green Guide minimum is never offered as clean
    const tight = defaultProject(); tight.seating.seatWidth = 460; tight.bowl.targetCapacity = 50000;
    const seatMoves = suggestMoves(tight, 20).filter((m) => m.id.startsWith('seat'));
    expect(seatMoves).toHaveLength(1);
    expect(seatMoves[0].breaks.length).toBeGreaterThan(0);
  });
});

describe('Q · v1 files', () => {
  it('open with Round 01 seat counts: no stands, vomitories or accessible positions', () => {
    for (const [file, seats] of [['four-stand', 30472], ['generic-soccer', 41868]] as const) {
      const p = parseProject(readFileSync(`tests/fixtures/v1-${file}.manicai.json`, 'utf8'));
      expect(p.version).toBe(4);
      const m = fresh(p).metrics;
      expect(m.gross, file).toBe(seats);
      expect(m.net, file).toBe(seats);
    }
  });
});
