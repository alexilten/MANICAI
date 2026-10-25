/**
 * The building section around the bowl (Round 03): concourses, premium levels, program zones and
 * vertical circulation cores.
 *
 * Everything is set out from the bowl, in the same (segment, u, d) plan frame as the seats, so the
 * architecture follows the bowl when it changes:
 *   • each tier is served by a concourse at its access level: the vomitory floor when the tier has
 *     vomitories (the concourse sits under the tier, starting where the soffit clears the concourse
 *     height), otherwise its back row (the concourse starts behind the tier);
 *   • premium levels are inserted under a tier (schema PremiumLevel): they lift that tier, sit with
 *     their glass line on the back of the tier below, and carry suites along the chosen stands;
 *   • program zones (concessions, toilets, retail, first aid, club lounges) line the back of each
 *     concourse, sized from per-spectator area allowances the user sets;
 *   • cores (stairs and lifts) stand outside the outermost floor plate at a regular spacing.
 *
 * This is conceptual space planning. Exit widths, travel distances and fixture counts depend on the
 * jurisdiction's code and are not checked (standards: review.egress, manicai.program).
 */
import type { PremiumLevel, Project, StandId } from '../schema';
import type { Mm } from '../units';
import { enclosedArea, isCorner, perimeter, pointAt, segmentLength, SEGMENTS, type PlanRing, type SegmentId } from './plan';
import { FASCIA_DEPTH, SOFFIT_DEPTH, type TierProfile } from './profile';

/** depth of the suite balcony in front of the glass (two rows of seats) */
export const BALCONY_DEPTH = 1800;
/** premium corridor behind the suites */
export const PREMIUM_CORRIDOR = 4000;
/** floor plate thickness drawn in the model */
export const SLAB = 300;

export type ProgramKind = 'concessions' | 'restrooms' | 'retail' | 'firstAid' | 'clubLounge';
export const PROGRAM_KINDS: ProgramKind[] = ['restrooms', 'concessions', 'retail', 'firstAid', 'clubLounge'];
export const PROGRAM_LABEL: Record<ProgramKind, string> = { concessions: 'Concessions', restrooms: 'Toilets', retail: 'Retail', firstAid: 'First aid', clubLounge: 'Club lounge' };

/** A band of the plan ring: all the way round, or part of one segment. */
export type Span = { seg: SegmentId; u0: number; u1: number } | 'ring';

export interface Level {
  id: string; name: string;
  kind: 'concourse' | 'suites' | 'club';
  /** tier index this level serves (concourses) or sits under (premium) */
  tier: number;
  /** floor level */
  z: Mm;
  /** plan band of the floor plate, behind the front-row line */
  d0: Mm; d1: Mm;
  /** circulation band (concourses: the concourse itself, behind it the program band) */
  circ: [Mm, Mm];
  area: number; // m²
  /** spectators this level serves */
  serves: number;
}

export interface Suite { id: string; level: string; seg: SegmentId; u0: number; u1: number; d0: Mm; d1: Mm; z: Mm; seats: number }
export interface ProgramZone { id: string; level: string; kind: ProgramKind; seg: SegmentId; u0: number; u1: number; d0: Mm; d1: Mm; z: Mm; area: number }
export interface Core { id: string; seg: SegmentId; u0: number; u1: number; d0: Mm; d1: Mm; zTop: Mm; stairs: number; lifts: number }

export interface BuildingMetrics {
  suites: number; suiteSeats: number;
  /** club lounge area and how many guests it holds at the allowance */
  clubLoungeArea: number; hospitality: number;
  concourseArea: number;
  programArea: Record<ProgramKind, number>;
  /** program area needed by the allowances vs. placed (placed < needed when the concourse frontage runs out) */
  programNeeded: number; programPlaced: number;
  premiumPlateArea: number;
  coreArea: number;
  /** floor plates + cores on every level they cross, m² (the bowl itself is not counted) */
  grossArea: number;
  cores: number;
  /** half the spacing between cores, measured along the outer concourse edge */
  maxToCore: Mm;
  /** outer face of the building (cores included), plan offset, and its footprint area */
  outerD: Mm; footprint: number;
}

export interface Building { levels: Level[]; suites: Suite[]; program: ProgramZone[]; cores: Core[]; metrics: BuildingMetrics }

/** Soffit level under a tier at plan offset d (linear, as drawn by tierOutline). */
export function soffitZ(prof: TierProfile, d: Mm): Mm {
  const back = prof.back, sb = prof.top - SOFFIT_DEPTH;
  if (prof.onGrade) {
    const slope = prof.base > 1 ? (prof.top - prof.bottom) / (back - prof.front) : 0;
    return slope > 0 ? Math.max(0, sb - (back - d) * slope) : 0;
  }
  const z0 = prof.bottom - FASCIA_DEPTH;
  const t = Math.min(1, Math.max(0, (d - prof.front) / (back - prof.front || 1)));
  return z0 + (sb - z0) * t;
}

/** The access level of a tier: its vomitory floor, or its back row. */
export function accessLevel(p: Project, prof: TierProfile): { z: Mm; under: boolean } {
  const v = p.tiers[prof.index]?.vomitories;
  if (v?.enabled && prof.base > 2) {
    const m0 = Math.min(prof.base - 1, Math.max(1, Math.round(v.mouthRow) - 1));
    return { z: prof.rows[m0 - 1].z, under: true };
  }
  return { z: prof.top, under: false };
}

/** Premium levels under tier `ti`, bottom-up, with their floor levels. */
export function premiumStack(p: Project, profiles: TierProfile[], ti: number): { level: PremiumLevel; z: Mm }[] {
  if (ti <= 0) return [];
  const prev = profiles[ti - 1], t = p.tiers[ti];
  let z = prev.top + t.elevation;
  return (p.premium ?? []).filter((l) => l.belowTier === t.id).map((level) => { const o = { level, z }; z += level.height; return o; });
}

/** Number of suites a level fits on one stand, and the margin either side. */
function suitesOn(ring: PlanRing, seg: SegmentId, width: Mm) {
  const len = segmentLength(ring, seg, 0);
  const n = Math.max(0, Math.floor((len - 2 * 2000) / Math.max(1000, width)));
  return { n, len, start: (len - n * width) / 2 };
}

/** Suite seats only (cheap: used by the capacity fit). */
export function suiteSeats(p: Project, ring: PlanRing): number {
  let seats = 0;
  for (const l of p.premium ?? []) {
    if (l.kind !== 'suites' || !p.tiers.some((t, i) => i > 0 && t.id === l.belowTier)) continue;
    for (const g of l.stands) seats += suitesOn(ring, g, l.unitWidth).n * l.seatsPerUnit;
  }
  return seats;
}

/** Arc length along the path at offset d → (segment, u). */
function locate(ring: PlanRing, d: Mm, s: number): { seg: SegmentId; u: number } {
  const total = perimeter(ring, d);
  let rem = ((s % total) + total) % total;
  for (const seg of SEGMENTS) {
    const L = segmentLength(ring, seg, d);
    if (L <= 1e-6) continue;
    if (rem <= L) return { seg, u: rem / L };
    rem -= L;
  }
  return { seg: 'E', u: 0 };
}

export function buildBuilding(p: Project, ring: PlanRing, profiles: TierProfile[], served: { tier: number[]; club: number[] }): Building {
  const b = p.building;
  const levels: Level[] = [], suites: Suite[] = [], program: ProgramZone[] = [], cores: Core[] = [];
  const band = (d0: Mm, d1: Mm) => (enclosedArea(ring, d1) - enclosedArea(ring, d0)) / 1e6;
  const programArea = Object.fromEntries(PROGRAM_KINDS.map((k) => [k, 0])) as Record<ProgramKind, number>;
  let programNeeded = 0, clubLevelLounge = 0, premiumPlateArea = 0, concourseArea = 0;

  // ── concourses, one per tier
  profiles.forEach((t, ti) => {
    const acc = accessLevel(p, t);
    let D0 = t.back;
    if (acc.under) {
      // first plan offset under the tier where the soffit clears the concourse
      const need = acc.z + b.concourseClear;
      const steps = 60;
      for (let k = 0; k <= steps; k++) { const d = t.front + ((t.back - t.front) * k) / steps; if (soffitZ(t, d) >= need) { D0 = d; break; } }
    }
    const c1 = D0 + b.concourseWidth, p1 = c1 + b.programDepth;
    const serves = served.tier[ti] ?? 0;
    const need: Record<ProgramKind, number> = {
      restrooms: serves * b.allowances.restrooms, concessions: serves * b.allowances.concessions,
      retail: serves * b.allowances.retail, firstAid: serves * b.allowances.firstAid,
      clubLounge: (served.club[ti] ?? 0) * b.allowances.clubLounge,
    };
    programNeeded += PROGRAM_KINDS.reduce((a, k) => a + need[k], 0);
    // a club tier's lounge gets its own band behind the program, as deep as its area needs (up to 30 m)
    const loungeDepth = need.clubLounge > 0 ? Math.min(30000, Math.max(b.programDepth, (need.clubLounge * 1e6) / (0.85 * perimeter(ring, p1)))) : 0;
    const d1 = p1 + loungeDepth;
    const lv: Level = { id: `CONC.${t.id}`, name: `${t.name} concourse`, kind: 'concourse', tier: ti, z: acc.z, d0: D0, d1, circ: [D0, c1], area: band(D0, d1), serves };
    levels.push(lv);
    concourseArea += band(D0, c1);

    // program bands along the back of the concourse, segment by segment in proportion to frontage
    const place = (kinds: ProgramKind[], bd0: Mm, bd1: Mm) => {
      const depth = bd1 - bd0, dm = (bd0 + bd1) / 2, per = perimeter(ring, dm);
      for (const seg of SEGMENTS) {
        const L = segmentLength(ring, seg, dm);
        if (L < 1000) continue;
        const lens = kinds.map((k) => (need[k] * (L / per) * 1e6) / depth);
        const sum = lens.reduce((a, v) => a + v, 0);
        if (sum <= 0) continue;
        const scale = Math.min(1, (L * 0.9) / sum);
        const blocks = kinds.map((k, i) => ({ k, len: lens[i] * scale })).filter((x) => x.len >= 500);
        const gap = (L - blocks.reduce((a, x) => a + x.len, 0)) / (blocks.length + 1);
        let s = gap;
        for (const { k, len } of blocks) {
          const area = (len * depth) / 1e6;
          program.push({ id: `PRG.${t.id}.${seg}.${k}`, level: lv.id, kind: k, seg, u0: s / L, u1: (s + len) / L, d0: bd0, d1: bd1, z: acc.z, area });
          programArea[k] += area;
          s += len + gap;
        }
      }
    };
    place(['restrooms', 'concessions', 'retail', 'firstAid'], c1, p1);
    if (loungeDepth > 0) place(['clubLounge'], p1, d1);
  });

  // ── premium levels
  profiles.forEach((_t, ti) => {
    const prev = profiles[ti - 1];
    for (const { level: l, z } of premiumStack(p, profiles, ti)) {
      const g0 = prev.back, d0 = g0 - BALCONY_DEPTH, d1 = g0 + l.unitDepth + PREMIUM_CORRIDOR;
      const lv: Level = { id: `PREM.${l.id}`, name: l.name, kind: l.kind, tier: ti, z, d0, d1, circ: [g0 + l.unitDepth, d1], area: band(d0, d1), serves: 0 };
      levels.push(lv);
      premiumPlateArea += lv.area;
      if (l.kind === 'suites') {
        for (const g of l.stands as StandId[]) {
          const { n, len, start } = suitesOn(ring, g, l.unitWidth);
          for (let k = 0; k < n; k++) {
            const s0 = start + k * l.unitWidth;
            suites.push({ id: `STE.${l.id}.${g}${String(k + 1).padStart(2, '0')}`, level: lv.id, seg: g, u0: s0 / len, u1: (s0 + l.unitWidth) / len, d0: g0, d1: g0 + l.unitDepth, z, seats: l.seatsPerUnit });
          }
        }
        lv.serves = suites.filter((s) => s.level === lv.id).reduce((a, s) => a + s.seats, 0);
      } else {
        // a club level: the whole plate behind the balcony is lounge
        clubLevelLounge += band(g0, d1);
      }
    }
  });
  const clubLoungeArea = programArea.clubLounge + clubLevelLounge;
  const hospitality = Math.floor(clubLoungeArea / Math.max(0.1, b.allowances.clubLounge));

  // ── cores outside the outermost plate (and the back of the bowl)
  const bowlBack = Math.max(0, ...profiles.map((t) => t.rows[t.rows.length - 1].d + t.rowDepth));
  const dOut = Math.max(bowlBack, ...levels.map((l) => l.d1));
  const c = b.cores;
  const dMid = dOut + c.depth / 2;
  const per = perimeter(ring, dMid);
  const n = Math.max(4, Math.round(per / Math.max(10000, c.spacing)));
  const zTop = Math.max(...levels.map((l) => l.z), ...profiles.map((t) => t.top)) + 4000;
  for (let k = 0; k < n; k++) {
    const sMid = (per * (k + 0.5)) / n;
    const at = locate(ring, dMid, sMid);
    const L = segmentLength(ring, at.seg, dMid);
    const du = c.width / 2 / L;
    const u0 = Math.max(0, at.u - du), u1 = Math.min(1, at.u + du);
    cores.push({ id: `CORE.${String(k + 1).padStart(2, '0')}`, seg: at.seg, u0, u1, d0: dOut, d1: dOut + c.depth, zTop, stairs: c.stairs, lifts: c.lifts });
  }
  const coreFloors = Math.max(1, new Set(levels.map((l) => Math.round(l.z / 1000))).size);
  const coreArea = (n * c.width * c.depth) / 1e6;
  const plates = levels.reduce((a, l) => a + l.area, 0);

  return {
    levels, suites, program, cores,
    metrics: {
      suites: suites.length, suiteSeats: suites.reduce((a, s) => a + s.seats, 0),
      clubLoungeArea, hospitality,
      concourseArea, programArea, programNeeded, programPlaced: PROGRAM_KINDS.reduce((a, k) => a + programArea[k], 0),
      premiumPlateArea, coreArea,
      grossArea: plates + coreArea * coreFloors,
      cores: n, maxToCore: per / n / 2,
      outerD: dOut + c.depth, footprint: enclosedArea(ring, dOut + c.depth) / 1e6,
    },
  };
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────

export interface BoxMesh { positions: Float32Array; index: Uint32Array }

/** Stations along a span (corners subdivided). */
function spanStations(ring: PlanRing, span: Span, cornerSteps = 24): { seg: SegmentId; u: number }[] {
  if (span !== 'ring') {
    const n = isCorner(span.seg) ? Math.max(1, Math.ceil(cornerSteps * (span.u1 - span.u0))) : 1;
    return Array.from({ length: n + 1 }, (_, k) => ({ seg: span.seg, u: span.u0 + ((span.u1 - span.u0) * k) / n }));
  }
  const out: { seg: SegmentId; u: number }[] = [];
  for (const seg of SEGMENTS) {
    if (!isCorner(seg) && segmentLength(ring, seg, 0) < 1e-6) continue;
    const n = isCorner(seg) ? cornerSteps : 1;
    for (let k = out.length ? 1 : 0; k <= n; k++) out.push({ seg, u: k / n });
  }
  out.pop(); // the ring closes onto its first station
  return out;
}

/**
 * A closed solid between plan offsets d0..d1 and levels z0..z1 along a span (a floor plate, a suite,
 * a program zone, a core). Faces wind outward; a full ring has no end caps.
 */
export function bandSolid(ring: PlanRing, span: Span, d0: Mm, d1: Mm, z0: Mm, z1: Mm): BoxMesh {
  const st = spanStations(ring, span);
  const closed = span === 'ring';
  const pos: number[] = [];
  for (const s of st) {
    const p = pointAt(ring, s.seg, s.u, 0);
    for (const [d, z] of [[d0, z0], [d1, z0], [d1, z1], [d0, z1]]) pos.push(p.x + p.nx * d, p.y + p.ny * d, z);
  }
  const idx: number[] = [];
  const m = st.length, segs = closed ? m : m - 1;
  // the four sides of the section, swept: (0 inner-bottom, 1 outer-bottom, 2 outer-top, 3 inner-top)
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b2 = ((i + 1) % m) * 4;
    for (let e = 0; e < 4; e++) {
      const p0 = a + e, p1 = a + ((e + 1) % 4), q0 = b2 + e, q1 = b2 + ((e + 1) % 4);
      idx.push(p0, q0, q1, p0, q1, p1);
    }
  }
  if (!closed) {
    const a = 0, z = (m - 1) * 4;
    idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    idx.push(z, z + 2, z + 1, z, z + 3, z + 2);
  }
  return { positions: new Float32Array(pos), index: new Uint32Array(idx) };
}
