/**
 * The stadium architecture around the bowl and building section (Round 04): structural grid,
 * rakers and columns, roof, facade and back-of-house.
 *
 * Everything is set out in the bowl's (segment, u, d) plan frame, so it follows the bowl:
 *   • radial grid lines (structural frames) are spaced at the bay along the outer column line; on the
 *     straights they are parallel, in the corners radial. Ring grid lines sit at the supports: the
 *     back of each tier, a mid support under each upper tier, and the outer column line;
 *   • a raker beam runs under every tier on every frame, along the tier's soffit, and columns carry
 *     the rakers down to the tier below (or to grade);
 *   • the roof bears on the outer column line. Its underside clears the highest tread by the set
 *     clearance at the back of the bowl and rises (or falls) toward the field at the set pitch; the
 *     primary frames taper to the leading edge. Enclosed types add a cap over the field, long-span
 *     trusses or retractable panels;
 *   • the facade wraps the building at a set offset beyond the cores and rises to the roof (or a
 *     parapet), with portals at the stand and corner centres;
 *   • back-of-house rooms line a service corridor at event level under and behind the lower tier,
 *     the team areas either side of the players' tunnel on the main stand.
 *
 * These are spatially rational conceptual representations, not structural designs (standards:
 * manicai.structure, manicai.roof, manicai.boh).
 */
import type { Project, RoofType, StandId } from '../schema';
import type { Mm } from '../units';
import { bandSolid, SLAB, sweepSolid, type BoxMesh, type Building, type Span } from './building';
import type { Layout } from './layout';
import { enclosedArea, isCorner, perimeter, planOffset, pointAt, segmentLength, SEGMENTS, STANDS, type PlanRing, type SegmentId } from './plan';
import { FASCIA_DEPTH, SOFFIT_DEPTH, type TierProfile } from './profile';
import type { SeatTable } from './seats';

/** roof skin (deck or membrane) thickness drawn in the model */
export const ROOF_SKIN = 250;
/** facade skin thickness drawn in the model */
export const FACADE_SKIN = 200;
/** the roof eave runs past the facade by this much */
export const EAVE = 2000;
/** the outer column line stands this far inside the facade */
export const COLUMN_SETBACK = 1500;

export const ROOF_LABEL: Record<RoofType, string> = {
  open: 'Open air', canopy: 'Partial canopy', perimeter: 'Perimeter canopy', enclosed: 'Fixed enclosed',
  etfe: 'Translucent ETFE', truss: 'Long-span truss', retractable: 'Retractable', sphere: 'Sphere (dome + LED Exosphere)',
};
/** roof types with a cap or panels over the field */
export const ENCLOSED: RoofType[] = ['enclosed', 'etfe', 'truss', 'retractable', 'sphere'];

/**
 * The spherical envelope's proportions, from the published figures of the Sphere in Las Vegas
 * (Populous; Severud Associates; Wikipedia, checked 2026-10-29). Standards: manicai.sphere.
 */
export const SPHERE = {
  /** Exosphere: 366 ft tall on a 516 ft diameter → top / radius */
  heightRatio: 366 / 258,
  /** interior: a 400 ft diameter cylinder under a spherical cap whose apex is 240 ft above the event floor → apex / radius */
  apexRatio: 240 / 200,
  /** the cap rises at least this share of the interior radius above the spring */
  minRise: 0.3,
  /** media plane share of the interior above the floor, from 160,000 ft² on the published interior (cap from a 160 ft spring) */
  screenShare: 160000 / (2 * Math.PI * 200 * 160 + Math.PI * (200 ** 2 + 80 ** 2)),
  /** catwalk and rigging zone between the media plane and the structural dome */
  domeGap: 4500,
  /** dome: sprayed concrete over the steel frame */
  shell: 250,
  /** radial roof trusses (32 of about 100 t each) and their depth */
  ribs: 32, ribDepth: 3000,
  /** diagrid zone of the Exosphere, and the clear zone kept between it and the dome or building */
  exoDepth: 1500, exoClear: 1500,
  /** LED puck centres on the Exosphere (8 in) */
  puckPitch: 203.2,
} as const;

/**
 * A spherical envelope: the Exosphere (a steel diagrid and LED skin on a truncated sphere standing on
 * the ground) around the interior, a cylinder under a spherical cap ("a bulging cylinder with a
 * spherical cap") whose inner face carries the LED media plane. Centres are at the plan centre of the
 * bowl (cx, cy); heights are above the event floor.
 */
export interface SphereEnvelope {
  cx: Mm; cy: Mm;
  /** Exosphere radius, centre height, top and its circle on the ground */
  R: Mm; zc: Mm; top: Mm; groundR: Mm;
  /** interior: cylinder radius a up to the spring, then a cap of radius capR centred at capZ up to the apex */
  a: Mm; springZ: Mm; capR: Mm; capZ: Mm; apex: Mm;
  /** the structural dome (domeGap outside the media plane) closes on a compression ring of radius crownR */
  crownR: Mm;
  /** media plane: the interior surface seen within `half` (radians) of `axis` from the point (cx, cy, eyeZ) */
  eyeZ: Mm; axis: [number, number, number]; half: number;
  /** areas, m²: media plane, Exosphere above ground, structural dome */
  screenArea: number; exoArea: number; domeArea: number;
  pucks: number; ribs: number;
}

export type BohKind = 'tunnel' | 'lockers' | 'officials' | 'medical' | 'media' | 'kitchens' | 'storage' | 'loading' | 'waste' | 'grounds' | 'eventOps';
export const BOH_LABEL: Record<BohKind, string> = {
  tunnel: 'Players’ tunnel', lockers: 'Team locker rooms', officials: 'Officials', medical: 'Medical', media: 'Press & broadcast',
  kitchens: 'Kitchens', storage: 'Storage', loading: 'Loading dock', waste: 'Waste', grounds: 'Groundskeeping', eventOps: 'Event operations',
};
export const BOH_KINDS: BohKind[] = ['tunnel', 'lockers', 'officials', 'medical', 'media', 'kitchens', 'storage', 'loading', 'waste', 'grounds', 'eventOps'];

/**
 * Back-of-house areas, m²: a fixed part plus a part per spectator. MANICAI planning assumptions for a
 * first massing (not a brief or a standard), scaled by boh.scale.
 */
export function bohNeeds(p: Project, capacity: number): Record<Exclude<BohKind, 'tunnel'>, number> {
  const k = p.architecture.boh.scale;
  const teams = p.sport === 'nfl' ? 1800 : 900; // two teams
  return {
    lockers: teams * k, officials: 120 * k, medical: (150 + 0.002 * capacity) * k, media: (300 + 0.008 * capacity) * k,
    kitchens: 0.02 * capacity * k, storage: 0.02 * capacity * k, loading: 1200 * k, waste: (200 + 0.003 * capacity) * k,
    grounds: 500 * k, eventOps: (250 + 0.002 * capacity) * k,
  };
}

/** A radial grid line (one structural frame). */
export interface Frame { id: string; seg: SegmentId; u: number }
/** A ring grid line at plan offset d. */
export interface RingLine { id: string; d: Mm; role: string }

/** A planar member on a radial grid line: a (d, z) quadrilateral given a width across the frame. */
export interface Member {
  id: string;
  kind: 'raker' | 'column' | 'roofFrame' | 'mullion';
  frame?: string;
  seg: SegmentId; u: number;
  /** inner-bottom, outer-bottom, outer-top, inner-top */
  section: [number, number][];
  width: Mm;
}
/** An axis-aligned box in world coordinates (trusses, retractable panels). */
export interface WorldBox { id: string; kind: 'truss' | 'panel'; min: [number, number, number]; max: [number, number, number] }
export interface Piece { id: string; seg: SegmentId; u0: number; u1: number; d0: Mm; d1: Mm; z0: Mm; z1: Mm }
export interface BohZone extends Piece { kind: BohKind; area: number }

export interface Roof {
  type: RoofType;
  /** skin spans: the ring, or the covered stands */
  spans: Span[];
  /** leading edge and eave plan offsets */
  dIn: Mm; dOut: Mm;
  /** skin top at the outer column line, and its slope (rise per mm toward the field) */
  zTop0: Mm; slope: number;
  /** primary frames stand above the deck (open roofs) rather than below it */
  exposed: boolean;
  /** depth of the primary frames at the outer column line (a quarter of it at the leading edge) */
  depth: Mm;
  /** cap over the field (enclosed types): edge level at dIn, rise at the centre */
  cap: { z: Mm; rise: Mm } | null;
  boxes: WorldBox[];
}

export interface ArchMetrics {
  frames: number; rakers: number; columns: number; roofFrames: number;
  /** roof plan area and surface area (slope and dome allowed for), m² */
  roofPlan: number; roofSurface: number;
  /** spectators (net seats) under the roof in plan projection, and the share */
  covered: number; coverage: number;
  /** open roofs: height of the back-row sightline under the leading edge over the centre spot; enclosed: clear height over the centre spot */
  viewClear: Mm;
  roofTop: Mm; eave: Mm;
  facadeD: Mm; facadeArea: number; facadeModules: number; facadeTop: Mm; portals: number;
  envelopeFootprint: number; envelopePerimeter: Mm;
  bohArea: number; bohNeeded: number; bohCorridorArea: number; bohHeight: Mm;
  /** building GFA (Round 03) plus back-of-house rooms and corridor, m² */
  grossArea: number;
}

export interface Architecture {
  frames: Frame[]; rings: RingLine[];
  members: Member[];
  roof: Roof;
  facade: { d: Mm; pieces: Piece[]; bands: Piece[]; canopies: Piece[]; top: Record<SegmentId, Mm> };
  boh: { zones: BohZone[]; corridor: { d0: Mm; d1: Mm; z: Mm } | null };
  /** spherical envelope (roof type 'sphere'): replaces the roof deck and the facade */
  sphere: SphereEnvelope | null;
  metrics: ArchMetrics;
}

/** Soffit of a tier as carried in one region (n rows): a line from the front (or grade) to the back. */
function soffitLine(t: TierProfile, n: number): { d0: Mm; z0: Mm; d1: Mm; z1: Mm } | null {
  if (n <= 0) return null;
  const last = t.rows[Math.min(n, t.rows.length) - 1];
  const back = last.d + t.rowDepth, top = last.z;
  if (t.onGrade) {
    const slope = n > 1 ? (top - t.bottom) / (back - t.front) : 0;
    const sb = Math.max(0, top - SOFFIT_DEPTH);
    if (sb <= 0 || slope <= 1e-6) return null;
    return { d0: Math.max(t.front, back - sb / slope), z0: 0, d1: back, z1: sb };
  }
  return { d0: t.front, z0: t.bottom - FASCIA_DEPTH, d1: back, z1: top - SOFFIT_DEPTH };
}
const atLine = (l: { d0: Mm; z0: Mm; d1: Mm; z1: Mm }, d: Mm) => l.z0 + ((l.z1 - l.z0) * (d - l.d0)) / (l.d1 - l.d0 || 1);

/** Inner edge of the roof opening: half-width in Y at world x (rounded rectangle at offset d). */
function edgeHalfY(ring: PlanRing, d: Mm, x: number) {
  const e = Math.min(0, ring.r + d);
  const sx = ring.hx - ring.r + e, sy = ring.hy - ring.r + e, R = Math.max(0, ring.r + d);
  const dx = Math.abs(x - ring.cx) - sx;
  return dx <= 0 ? ring.hy + d : sy + Math.sqrt(Math.max(0, R * R - dx * dx));
}

/** Arc length position along the path at offset d → (segment, u). */
function locate(ring: PlanRing, d: Mm, s: number): { seg: SegmentId; u: number } {
  const total = perimeter(ring, d);
  let rem = ((s % total) + total) % total;
  for (const seg of SEGMENTS) {
    const L = segmentLength(ring, seg, d);
    if (L <= 1e-6) continue;
    if (rem <= L + 1e-9) return { seg, u: Math.min(1, rem / L) };
    rem -= L;
  }
  return { seg: 'E', u: 0 };
}
/** Arc length of the start of a segment along the path at offset d. */
export function segStart(ring: PlanRing, d: Mm, seg: SegmentId) {
  let s = 0;
  for (const g of SEGMENTS) { if (g === seg) return s; s += segmentLength(ring, g, d); }
  return s;
}
/** Split the arc s0..s1 (may wrap) into pieces that each lie in one segment. */
export function arcPieces(ring: PlanRing, d: Mm, s0: number, s1: number): { seg: SegmentId; u0: number; u1: number }[] {
  const total = perimeter(ring, d);
  const out: { seg: SegmentId; u0: number; u1: number }[] = [];
  let a = s0;
  for (let guard = 0; a < s1 - 1 && guard < 20; guard++) {
    const at = locate(ring, d, a);
    const L = segmentLength(ring, at.seg, d);
    const segEnd = a + (1 - at.u) * L;
    const b = Math.min(s1, segEnd);
    if (b - a > 1) out.push({ seg: at.seg, u0: at.u, u1: at.u + (b - a) / L });
    a = segEnd >= s1 ? s1 : segEnd + 1e-6;
    if (a >= total * 4) break;
  }
  return out;
}

export function buildArchitecture(
  p: Project, ring: PlanRing, layout: Layout, profiles: TierProfile[], building: Building,
  ctx: { seats: SeatTable; net: number; fieldLength: Mm; fieldWidth: Mm },
): Architecture {
  const A = p.architecture, S = A.structure, R = A.roof, F = A.facade;
  const bm = building.metrics;
  const members: Member[] = [];

  // ── key lines
  const type = R.type;
  const isSphere = type === 'sphere';
  const sphere = isSphere ? sizeSphere(p, ring, layout, profiles, building) : null;
  // a sphere: the facade line is the largest offset of the plan ring that stands inside the Exosphere's ground circle
  const dF = sphere ? sphereFacadeLine(ring, sphere) : bm.outerD + F.offset;
  const dCol = dF - COLUMN_SETBACK;            // outer column line
  const dOut = dF + EAVE;                      // roof eave
  let topZ = 0, dTop = 0;
  profiles.forEach((t) => {
    for (const seg of SEGMENTS) {
      const n = layout.rows[seg][t.index];
      if (n <= 0) continue;
      const r = t.rows[Math.min(n, t.rows.length) - 1];
      if (r.z > topZ || (r.z === topZ && r.d + t.rowDepth > dTop)) { topZ = r.z; dTop = r.d + t.rowDepth; }
    }
  });
  const coreTop = Math.max(0, ...building.cores.map((c) => c.zTop));
  const parapet = Math.max(coreTop, topZ + 3000);

  // ── roof: which segments it covers, its leading edge and levels
  const roofed = type !== 'open';
  const stands = new Set<StandId>(R.stands);
  // the sphere's dome is drawn on its own, so no roof deck or frames bear on the column line
  const covers = (seg: SegmentId) => roofed && !isSphere && (type !== 'canopy' || (!isCorner(seg) && stands.has(seg as StandId)));
  const minDist = Math.min(...STANDS.map((g) => ring.dist[g]));
  const dIn = Math.max(-R.overhang, -(minDist + Math.min(ctx.fieldLength, ctx.fieldWidth) / 2) + 5000);
  const slope = Math.tan((R.pitch * Math.PI) / 180);
  const depthAt = (d: Mm) => (d >= dCol ? R.depth : R.depth * (0.25 + (0.75 * Math.max(0, d - dIn)) / Math.max(1, dCol - dIn)));
  const topAt0 = (d: Mm) => (dCol - d) * slope; // relative to zTop0
  // skin top at the column line so that the frame underside clears the bowl, the cores and the levels
  const needs: [number, number][] = [[dTop, topZ + R.clearance]];
  for (const c of building.cores) needs.push([c.d0, c.zTop + 500], [c.d1, c.zTop + 500]);
  for (const l of building.levels) needs.push([Math.max(dIn, l.d1), l.z + 4000]);
  // open roofs carry their primary frames exposed above the deck; enclosed roofs hang them below it
  const exposed = type === 'canopy' || type === 'perimeter' || type === 'retractable';
  const hang = (d: Mm) => (exposed ? 0 : depthAt(d));
  const zTop0 = Math.max(...needs.map(([d, z]) => { const dd = Math.max(dIn, Math.min(dOut, d)); return z - topAt0(dd) + ROOF_SKIN + hang(dd); }));
  const top = (d: Mm) => zTop0 + topAt0(d);
  const under = (d: Mm) => top(d) - ROOF_SKIN - hang(d);

  // ── structural grid: radial frames at the bay along the outer column line
  const frames: Frame[] = [];
  for (const seg of SEGMENTS) {
    const L = segmentLength(ring, seg, dCol);
    if (L < 1000) continue;
    const n = Math.max(1, Math.round(L / Math.max(3000, S.bay)));
    for (let k = 0; k < n; k++) frames.push({ id: `GL.${String(frames.length + 1).padStart(3, '0')}`, seg, u: k / n });
  }
  // ring lines: tier backs, mid supports under upper tiers, the outer column line
  const cand: { d: Mm; role: string }[] = [];
  profiles.forEach((t, ti) => {
    cand.push({ d: t.back - 1000, role: `${t.name} back support` });
    if (ti > 0) {
      const prevBack = profiles[ti - 1].back;
      const dm = Math.max(t.front + 0.45 * (t.back - t.front), prevBack + 2000);
      if (dm < t.back - 4000) cand.push({ d: dm, role: `${t.name} mid support` });
    }
  });
  cand.sort((a, b) => a.d - b.d);
  const rings: RingLine[] = [];
  for (const c of cand) if (!rings.length || c.d - rings[rings.length - 1].d > 2500) rings.push({ id: '', d: c.d, role: c.role });
  if (rings.length && dCol - rings[rings.length - 1].d < 2500) rings.pop();
  rings.push({ id: '', d: dCol, role: 'Outer column line (facade and roof)' });
  rings.forEach((r, i) => { r.id = `GL.${String.fromCharCode(65 + i)}`; });

  const rect = (d0: Mm, d1: Mm, z0: Mm, z1: Mm): [number, number][] => [[d0, z0], [d1, z0], [d1, z1], [d0, z1]];
  let rakers = 0, columns = 0, roofFrames = 0;
  frames.forEach((fr, fi) => {
    const lines = profiles.map((t) => soffitLine(t, layout.rows[fr.seg][t.index]));
    // rakers under every tier this region carries
    profiles.forEach((t, ti) => {
      const l = lines[ti];
      if (!l) return;
      const h = S.rakerDepth;
      let d0 = l.d0;
      if (t.onGrade) d0 = Math.min(l.d1 - 500, l.d0 + (h / Math.max(1e-6, l.z1 - l.z0)) * (l.d1 - l.d0)); // where the beam leaves the ground
      const z0 = atLine(l, d0);
      if (l.z1 - h < 300) return;
      members.push({ id: `RKR.${t.id}.${fr.id.slice(3)}`, kind: 'raker', frame: fr.id, seg: fr.seg, u: fr.u, section: [[d0, Math.max(0, z0 - h)], [l.d1, l.z1 - h], [l.d1, l.z1], [d0, z0]], width: 600 });
      rakers++;
    });
    // columns on the ring lines: from the tier below (or grade) up to the raker of the highest tier over that line
    for (const rl of rings) {
      const c = S.column;
      let z0 = 0, z1 = 0;
      if (rl.d === dCol) {
        z1 = covers(fr.seg) ? under(dCol) : parapet;
      } else {
        let hi = -1;
        lines.forEach((l, ti) => { if (l && rl.d > l.d0 + 500 && rl.d < l.d1) hi = ti; });
        if (hi < 0) continue;
        z1 = atLine(lines[hi]!, rl.d) - S.rakerDepth;
        for (let ti = 0; ti < hi; ti++) { const l = lines[ti]; if (l && rl.d > l.d0 && rl.d < l.d1) z0 = Math.max(z0, atLine(l, rl.d) - S.rakerDepth); }
      }
      if (z1 - z0 < 1000) continue;
      const heavy = rl.d === dCol && covers(fr.seg) && fi % Math.max(1, R.frameEvery) === 0;
      const w = heavy ? c * 1.4 : c;
      members.push({ id: `COL.${rl.id.slice(3)}.${fr.id.slice(3)}`, kind: 'column', frame: fr.id, seg: fr.seg, u: fr.u, section: rect(rl.d - w / 2, rl.d + w / 2, z0, z1), width: w });
      columns++;
    }
    // primary roof frames on every n-th grid line: tapering from the column line to the leading edge
    if (covers(fr.seg) && fi % Math.max(1, R.frameEvery) === 0) {
      const t0 = top(dIn), t1 = top(dOut);
      const section: [number, number][] = exposed
        ? [[dIn, t0], [dOut, t1], [dOut, t1 + R.depth], [dIn, t0 + depthAt(dIn)]]
        : [[dIn, t0 - ROOF_SKIN - depthAt(dIn)], [dOut, t1 - ROOF_SKIN - R.depth], [dOut, t1 - ROOF_SKIN], [dIn, t0 - ROOF_SKIN]];
      members.push({ id: `RF.${fr.id.slice(3)}`, kind: 'roofFrame', frame: fr.id, seg: fr.seg, u: fr.u, section, width: 900 });
      roofFrames++;
    }
  });

  // ── roof skin, cap, trusses and panels
  const spans: Span[] = !roofed || isSphere ? [] : type === 'canopy' ? STANDS.filter((g) => stands.has(g) && segmentLength(ring, g, 0) > 1000).map((g) => ({ seg: g, u0: 0, u1: 1 })) : ['ring'];
  const enclosed = ENCLOSED.includes(type);
  const halfX = ring.hx + dIn, halfY = ring.hy + dIn;
  const rise = type === 'enclosed' || type === 'etfe' ? 0.08 * Math.min(halfX, halfY) : 0;
  const cap = enclosed && type !== 'retractable' && !isSphere ? { z: top(dIn), rise } : null;
  const boxes: WorldBox[] = [];
  let trussDepth = 0;
  const spacing = Math.max(15000, S.bay * Math.max(1, R.frameEvery) * 1.5);
  if (type === 'truss' || type === 'etfe') {
    trussDepth = type === 'truss' ? Math.max(R.depth, (2 * halfY) / 12) : R.depth;
    const n = Math.max(2, Math.floor((2 * halfX) / spacing));
    const zt = top(dIn) - ROOF_SKIN;
    for (let k = 0; k < n; k++) {
      const x = ring.cx - halfX + (2 * halfX * (k + 0.5)) / n;
      const hy = edgeHalfY(ring, dIn, x) + 4000;
      boxes.push({ id: `TRUSS.${String(k + 1).padStart(2, '0')}`, kind: 'truss', min: [x - 1500, ring.cy - hy, zt - trussDepth], max: [x + 1500, ring.cy + hy, zt] });
    }
  }
  if (type === 'retractable') {
    trussDepth = R.depth * 1.4;
    const zp = Math.max(top(dIn), top(dOut)) + R.depth + 1500;
    const xr = ring.hx + dCol;
    for (const sg of [-1, 1]) boxes.push({ id: `TRUSS.TRACK_${sg < 0 ? 'S' : 'N'}`, kind: 'truss', min: [ring.cx - xr, ring.cy + sg * (halfY + 1500) - 1500, zp - trussDepth], max: [ring.cx + xr, ring.cy + sg * (halfY + 1500) + 1500, zp] });
    const o = Math.min(1, Math.max(0, R.open));
    const len = halfX + 3000;
    boxes.push({ id: 'PANEL.W', kind: 'panel', min: [ring.cx - len - o * halfX, ring.cy - halfY - 1500, zp], max: [ring.cx - o * halfX, ring.cy + halfY + 1500, zp + 1500] });
    boxes.push({ id: 'PANEL.E', kind: 'panel', min: [ring.cx + o * halfX, ring.cy - halfY - 1500, zp], max: [ring.cx + len + o * halfX, ring.cy + halfY + 1500, zp + 1500] });
  }
  const roof: Roof = { type, spans, dIn, dOut, zTop0, slope, exposed, depth: R.depth, cap, boxes };

  // ── facade: skin pieces (split at the portals), mullions or fins, slab-edge bands
  const pieces: Piece[] = [], bands: Piece[] = [], canopies: Piece[] = [];
  const ftop = {} as Record<SegmentId, Mm>;
  let facadeArea = 0, modules = 0, portals = 0;
  const pH = Math.min(F.portalHeight, parapet - 2000);
  for (const seg of SEGMENTS) {
    const L = segmentLength(ring, seg, dF);
    ftop[seg] = sphere ? sphere.top : covers(seg) ? top(dF) : parapet;
    if (L < 500 || sphere) continue;
    const zt = ftop[seg];
    const portal = (F.portals === 8 || (F.portals === 4 && !isCorner(seg))) && L > F.portalWidth + 4000;
    const pw = portal ? F.portalWidth / L : 0;
    const pu0 = 0.5 - pw / 2, pu1 = 0.5 + pw / 2;
    const P = (id: string, u0: number, u1: number, z0: Mm, z1: Mm, d0 = dF, d1 = dF + FACADE_SKIN): Piece => ({ id, seg, u0, u1, d0, d1, z0, z1 });
    if (portal) {
      pieces.push(P(`FCD.${seg}.L1`, 0, pu0, 0, pH), P(`FCD.${seg}.L2`, pu1, 1, 0, pH), P(`FCD.${seg}.U`, 0, 1, pH, zt));
      canopies.push(P(`PORTAL.${seg}`, Math.max(0, pu0 - 2000 / L), Math.min(1, pu1 + 2000 / L), pH, pH + 800, dF, dF + 5000));
      portals++;
    } else pieces.push(P(`FCD.${seg}`, 0, 1, 0, zt));
    facadeArea += (L * zt - (portal ? F.portalWidth * pH : 0)) / 1e6;
    // mullions / fins along the module
    const n = Math.max(1, Math.round(L / Math.max(600, F.module)));
    modules += n;
    const sect = F.type === 'fins' ? { d: 1200, w: 300 } : F.type === 'perforated' ? { d: 300, w: 120 } : F.type === 'glazed' ? { d: 250, w: 100 } : null;
    if (sect) for (let k = 0; k < n; k++) {
      const u = k / n;
      const z0 = portal && u > pu0 - 1e-6 && u < pu1 + 1e-6 ? pH : 0;
      members.push({ id: `MUL.${seg}.${String(k + 1).padStart(3, '0')}`, kind: 'mullion', seg, u, section: rect(dF + FACADE_SKIN, dF + FACADE_SKIN + sect.d, z0, zt), width: sect.w });
    }
    // slab-edge bands at the building levels (glazed facades)
    if (F.type === 'glazed' || F.type === 'fins') for (const l of building.levels) {
      if (l.z - 1000 < pH + 500 || l.z + 300 > zt - 500) continue;
      bands.push(P(`BAND.${l.id}.${seg}`, 0, 1, l.z - 1000, l.z + 300, dF + FACADE_SKIN, dF + FACADE_SKIN + 200));
    }
  }

  // ── back-of-house at event level
  const t1 = profiles[0];
  const needs2 = bohNeeds(p, ctx.net + bm.suiteSeats);
  const B = A.boh;
  let bohHeight = B.clear;
  const zones: BohZone[] = [];
  let corridor: Architecture['boh']['corridor'] = null;
  let bohArea = 0;
  const bohNeeded = Object.values(needs2).reduce((a, v) => a + v, 0);
  if (t1) {
    // rooms start under the lower tier where its soffit clears them
    let b0 = t1.back;
    for (let k = 0; k <= 60; k++) { const d = t1.front + ((t1.back - t1.front) * k) / 60; if (bohSoffit(t1, d) >= bohHeight + SLAB) { b0 = d; break; } }
    const c1 = b0 + B.corridor, r1 = Math.min(c1 + B.depth, dF - 1000);
    const over = building.levels.filter((l) => l.d0 < r1 && l.d1 > b0).map((l) => l.z - SLAB);
    if (over.length) bohHeight = Math.min(bohHeight, Math.min(...over));
    corridor = { d0: b0, d1: c1, z: 0 };
    const depth = r1 - c1;
    if (depth > 2000 && bohHeight > 2000) {
      const dm = (c1 + r1) / 2, per = perimeter(ring, dm);
      const main = B.mainStand;
      const sMain = segStart(ring, dm, main) + segmentLength(ring, main, dm) / 2;
      const order: Exclude<BohKind, 'tunnel'>[] = ['lockers', 'lockers', 'officials', 'medical', 'media', 'eventOps', 'kitchens', 'storage', 'grounds', 'waste', 'loading'];
      const area: number[] = order.map((k, i) => (k === 'lockers' ? needs2.lockers / 2 : order.indexOf(k) === i ? needs2[k] : 0));
      const gap = 2000, tunnelW = 8000;
      const total = area.reduce((a, v) => a + (v * 1e6) / depth + gap, 0) + tunnelW;
      const k = Math.min(1, (per * 0.95) / total);
      let right = sMain + (tunnelW / 2) * k, left = sMain - (tunnelW / 2) * k;
      // the players' tunnel: from the field edge through the lower tier to the corridor, on the main stand centre
      const Lm = segmentLength(ring, main, 0);
      // no tunnel where the main stand has no straight to centre it on (a round bowl)
      if (Lm > tunnelW) zones.push({ id: 'BOH.TUNNEL', kind: 'tunnel', seg: main, u0: 0.5 - tunnelW / 2 / Lm, u1: 0.5 + tunnelW / 2 / Lm, d0: -Math.min(4000, ring.dist[main] - 1000), d1: b0, z0: 0, z1: Math.min(4000, bohHeight), area: (tunnelW * (b0 + 4000)) / 1e6 });
      order.forEach((kind, i) => {
        if (area[i] <= 0) return;
        const len = ((area[i] * 1e6) / depth) * k;
        const toRight = i % 2 === 0;
        const s0 = toRight ? right + gap * k : left - gap * k - len;
        const s1 = s0 + len;
        if (toRight) right = s1; else left = s0;
        const base = s0 < 0 ? s0 + per : s0;
        const parts = arcPieces(ring, dm, base, base + len);
        parts.forEach((q, j) => {
          const a = ((q.u1 - q.u0) * segmentLength(ring, q.seg, dm) * depth) / 1e6;
          const sameKind = order.slice(0, i).filter((x) => x === kind).length;
          zones.push({ id: `BOH.${kind.toUpperCase()}${kind === 'lockers' ? (sameKind ? '.AWAY' : '.HOME') : ''}${parts.length > 1 ? `.${j + 1}` : ''}`, kind, seg: q.seg, u0: q.u0, u1: q.u1, d0: c1, d1: r1, z0: 0, z1: bohHeight, area: a });
          bohArea += a;
        });
      });
    }
  }
  const bohCorridorArea = corridor ? (enclosedArea(ring, corridor.d1) - enclosedArea(ring, corridor.d0)) / 1e6 : 0;

  // ── roof metrics: areas, coverage, view
  let roofPlan = 0;
  if (sphere) roofPlan = (Math.PI * (sphere.a + SPHERE.domeGap) ** 2) / 1e6;
  else if (roofed) {
    if (type === 'canopy') for (const sp of spans) if (sp !== 'ring') roofPlan += (segmentLength(ring, sp.seg, 0) * (dOut - dIn)) / 1e6;
    if (type !== 'canopy') roofPlan = (enclosedArea(ring, dOut) - enclosedArea(ring, dIn)) / 1e6;
  }
  const capPlan = enclosed ? enclosedArea(ring, dIn) / 1e6 : 0;
  const capSpan = 2 * Math.min(halfX, halfY);
  let roofSurface = sphere ? sphere.domeArea : roofPlan / Math.cos(Math.atan(slope)) + capPlan * (1 + (8 / 3) * (rise / Math.max(1, capSpan)) ** 2);
  for (const b of boxes) if (b.kind === 'panel') roofSurface += ((b.max[0] - b.min[0]) * (b.max[1] - b.min[1])) / 1e6;
  const panels = boxes.filter((b) => b.kind === 'panel');
  const st = ctx.seats;
  let covered = 0;
  if (roofed) for (let i = 0; i < st.count; i++) {
    if (st.status[i] !== 0) continue;
    if (type === 'enclosed' || type === 'etfe' || type === 'truss' || isSphere) { covered++; continue; }
    const sec = st.sector[i]; // SECTORS: north, south, east, west, then corners
    const seg = (['N', 'S', 'E', 'W'] as SegmentId[])[sec];
    if (type === 'canopy' && (sec > 3 || !stands.has(seg as StandId))) continue;
    const x = st.x[i], y = st.y[i];
    if (planOffset(ring, x, y) >= dIn || panels.some((b) => x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1])) covered++;
  }
  // view: open roofs, the worst covered stand's back-row sightline under the leading edge, at the centre spot
  let viewClear = Infinity;
  if (roofed && (type === 'canopy' || type === 'perimeter' || (type === 'retractable' && R.open > 0.5))) {
    for (const g of STANDS) {
      if (!covers(g)) continue;
      const tiers = profiles.filter((t) => layout.rows[g][t.index] > 0);
      const t = tiers[tiers.length - 1];
      if (!t) continue;
      const r = t.rows[Math.min(layout.rows[g][t.index], t.rows.length) - 1];
      const dC = -(ring.dist[g] + (g === 'N' || g === 'S' ? ctx.fieldWidth : ctx.fieldLength) / 2);
      const zEdge = under(dIn);
      const z = dIn <= dC ? under(dC) : r.eyeZ + ((zEdge - r.eyeZ) * (r.eyeD - dC)) / (r.eyeD - dIn);
      viewClear = Math.min(viewClear, z);
    }
  } else if (sphere) viewClear = sphere.apex;
  else if (cap) viewClear = cap.z + cap.rise - ROOF_SKIN - trussDepth;
  else if (type === 'retractable') viewClear = Math.max(top(dIn), top(dOut)) + R.depth + 1500 - trussDepth;
  if (!Number.isFinite(viewClear)) viewClear = 0;

  const roofTop = !roofed ? 0 : sphere ? sphere.top : Math.max(top(dIn) + (exposed ? depthAt(dIn) : 0), top(dOut) + (exposed ? R.depth : 0), cap ? cap.z + cap.rise : 0, ...boxes.map((b) => b.max[2]));
  return {
    frames, rings, members, roof,
    facade: { d: dF, pieces, bands, canopies, top: ftop },
    boh: { zones, corridor },
    sphere,
    metrics: {
      frames: frames.length, rakers, columns, roofFrames,
      roofPlan, roofSurface, covered, coverage: ctx.net ? covered / ctx.net : 0, viewClear,
      roofTop, eave: sphere ? sphere.springZ : roofed ? top(dOut) : 0,
      facadeD: dF, facadeArea: sphere ? sphere.exoArea : facadeArea, facadeModules: sphere ? sphere.pucks : modules, facadeTop: Math.max(...Object.values(ftop)), portals,
      envelopeFootprint: sphere ? (Math.PI * sphere.groundR ** 2) / 1e6 : enclosedArea(ring, dF) / 1e6, envelopePerimeter: sphere ? 2 * Math.PI * sphere.groundR : perimeter(ring, dF),
      bohArea, bohNeeded, bohCorridorArea, bohHeight,
      grossArea: bm.grossArea + bohArea + bohCorridorArea,
    },
  };
}

/**
 * Size the spherical envelope (manicai.sphere). The interior cylinder clears the back of the bowl and the
 * cap springs above the top row, both by the roof clearance, keeping the published apex / radius
 * proportion. The Exosphere is the smallest truncated sphere with the published height / width
 * proportion that holds the dome (with its trusses), the building levels and the cores, with a clear
 * zone behind its diagrid. The media plane is the part of the interior aimed at the stage, sized to the
 * published share and reaching the floor behind the stage.
 */
export function sizeSphere(p: Project, ring: PlanRing, layout: Layout, profiles: TierProfile[], building: Building): SphereEnvelope {
  const clear = p.architecture.roof.clearance;
  const plan: [number, number, number][] = []; // (x, y, z)
  const around = (d: Mm, z: Mm, segs: readonly SegmentId[] = SEGMENTS) => {
    for (const seg of segs) for (let k = 0; k <= (isCorner(seg) ? 8 : 1); k++) {
      const q = pointAt(ring, seg, k / (isCorner(seg) ? 8 : 1), d);
      plan.push([q.x, q.y, z]);
    }
  };
  let top = 0;
  for (const seg of SEGMENTS) profiles.forEach((t) => {
    const n = layout.rows[seg][t.index];
    if (n <= 0) return;
    const r = t.rows[Math.min(n, t.rows.length) - 1];
    top = Math.max(top, r.z);
    around(r.d + t.rowDepth, r.z);
  });
  const stage = pointAt(ring, 'E', 0.5, 0).x + STAGE_ROOM;
  // the plan centre on the bowl's axis that keeps the interior smallest (a horseshoe sits off the ring centre)
  const reachFrom = (x0: number) => Math.max(...plan.map(([x, y]) => Math.hypot(x - x0, y - ring.cy)), stage - x0);
  let cx = ring.cx, best = Infinity;
  for (let k = 0; k <= 40; k++) { const x0 = ring.cx - ring.hx + (2 * ring.hx * k) / 40, v = reachFrom(x0); if (v < best) { best = v; cx = x0; } }
  const cy = ring.cy;
  const pts: [number, number][] = plan.map(([x, y, z]) => [Math.hypot(x - cx, y - cy), z]);
  // interior: the cylinder clears the bowl and the stage, the cap springs above the top row
  const reach = best;
  const springZ = Math.max(top + clear, ...building.levels.map((l) => l.z + 4000));
  const a0 = reach + clear;
  const a = Math.max(a0, springZ / (SPHERE.apexRatio - SPHERE.minRise));
  const apex = SPHERE.apexRatio * a, rise = apex - springZ;
  const capR = (a * a + rise * rise) / (2 * rise), capZ = apex - capR;
  // Exosphere: hold the building, the cylinder wall and the dome (with trusses) inside the diagrid's clear zone
  pts.length = 0; plan.length = 0;
  for (const l of building.levels) around(l.d1, l.z + 4000);
  for (const c of building.cores) around(c.d1, c.zTop);
  around(building.metrics.outerD + COLUMN_SETBACK, 0);
  for (const [x, y, z] of plan) pts.push([Math.hypot(x - cx, y - cy), z]);
  const out = SPHERE.domeGap + SPHERE.shell + SPHERE.ribDepth;
  const eS = Math.asin(Math.min(1, (springZ - capZ) / (capR + out)));
  for (let k = 0; k <= 12; k++) { const e = eS + (Math.PI / 2 - eS) * (k / 12); pts.push([(capR + out) * Math.cos(e), capZ + (capR + out) * Math.sin(e)]); }
  pts.push([a + out, 0], [a + out, springZ]);
  const kc = SPHERE.heightRatio - 1, gap = SPHERE.exoDepth + SPHERE.exoClear;
  const solve = (ok: (r: number) => boolean) => { let lo = 1000, hi = 1e6; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; } return hi; };
  const R = solve((x) => pts.every(([rho, z]) => z < kc * x + x - gap && rho * rho + (z - kc * x) ** 2 <= (x - gap) ** 2));
  const zc = kc * R;
  const env: SphereEnvelope = {
    cx, cy, R, zc, top: zc + R, groundR: Math.sqrt(R * R - zc * zc),
    a, springZ, capR, capZ, apex, crownR: 0.08 * a,
    eyeZ: springZ * 0.4, axis: [1, 0, 0], half: 0,
    screenArea: 0, exoArea: (2 * Math.PI * R * (zc + R)) / 1e6, domeArea: 0, pucks: 0, ribs: SPHERE.ribs,
  };
  env.pucks = Math.round((env.exoArea * 1e6) / SPHERE.puckPitch ** 2);
  const ro = capR + SPHERE.domeGap;
  env.domeArea = (2 * Math.PI * ro * (capZ + ro - springZ)) / 1e6;
  // media plane: bisect the half-angle on the published share; the lowest edge meets the floor behind the stage
  const total = (2 * Math.PI * a * springZ + 2 * Math.PI * capR * rise) / 1e6;
  const dip = Math.atan2(env.eyeZ, a);
  let lo = 0.2, hi = Math.PI * 0.95;
  for (let i = 0; i < 30; i++) {
    const h = (lo + hi) / 2;
    env.half = h; env.axis = axisAt(h - dip);
    if (screenAreaOf(env) < SPHERE.screenShare * total) lo = h; else hi = h;
  }
  env.half = lo; env.axis = axisAt(lo - dip);
  env.screenArea = screenAreaOf(env);
  return env;
}
/** room kept for the stage house between the floor's east edge and the interior wall */
const STAGE_ROOM = 18000;
const axisAt = (el: number): [number, number, number] => [Math.cos(el), 0, Math.sin(el)];

/** Where the ray from the media-plane eye point along unit `v` meets the interior surface (cylinder below the spring, cap above). */
export function interiorHit(s: SphereEnvelope, v: [number, number, number], grow = 0): [number, number, number] {
  const h = Math.hypot(v[0], v[1]);
  const a = s.a + grow, R = s.capR + grow;
  // cylinder: horizontal reach a
  if (h > 1e-9) {
    const t = a / h, z = s.eyeZ + v[2] * t;
    if (z <= s.springZ) return [s.cx + v[0] * t, s.cy + v[1] * t, Math.max(0, z)];
  }
  // cap: |(0,0,eyeZ − capZ) + t v| = R
  const oz = s.eyeZ - s.capZ, b = oz * v[2], c = oz * oz - R * R;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  return [s.cx + v[0] * t, s.cy + v[1] * t, s.eyeZ + v[2] * t];
}

/** Directions in the media-plane cone: polar angle th from the axis, azimuth ps about it. */
function coneDir(s: SphereEnvelope, th: number, ps: number): [number, number, number] {
  const ax = s.axis, u = norm3(cross3([0, 0, 1], ax)), w = cross3(ax, u);
  const sn = Math.sin(th), co = Math.cos(th);
  return norm3([0, 1, 2].map((j) => ax[j] * co + (u[j] * Math.cos(ps) + w[j] * Math.sin(ps)) * sn));
}

/** Area of the media plane, m² (the surface hit by the cone, summed over a grid of small quads). */
function screenAreaOf(s: SphereEnvelope, rows = 40, cols = 96): number {
  let A = 0;
  const P = (i: number, j: number) => interiorHit(s, coneDir(s, (s.half * i) / rows, (2 * Math.PI * j) / cols));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const p0 = P(i, j), p1 = P(i + 1, j), p2 = P(i + 1, j + 1), p3 = P(i, j + 1);
    A += (triArea(p0, p1, p2) + triArea(p0, p2, p3));
  }
  return A / 1e6;
}
const triArea = (a: number[], b: number[], c: number[]) => Math.hypot(...cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]])) / 2;

/** The largest plan offset of the ring that stays inside the Exosphere's ground circle. */
function sphereFacadeLine(ring: PlanRing, s: SphereEnvelope): Mm {
  const far = (d: Mm) => Math.max(...stationsAt(ring, d, 8).map(([x, y]) => Math.hypot(x - s.cx, y - s.cy)));
  let lo = 0, hi = s.groundR;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (far(m) <= s.groundR - FACADE_SKIN) lo = m; else hi = m; }
  return lo;
}

/** Is a point inside the Exosphere? */
export const insideSphere = (s: SphereEnvelope, x: number, y: number, z: number) => z >= 0 && (x - s.cx) ** 2 + (y - s.cy) ** 2 + (z - s.zc) ** 2 < s.R * s.R;

/** The media plane as a closed panel `thick` deep behind its face (rows from the axis outward). */
export function screenSolid(s: SphereEnvelope, thick = 300, rows = 36, cols = 128): BoxMesh {
  const pos: number[] = [];
  for (const g of [0, thick]) for (let i = 0; i <= rows; i++) for (let j = 0; j < cols; j++) pos.push(...interiorHit(s, coneDir(s, (s.half * i) / rows, (2 * Math.PI * j) / cols), g));
  return closeGrid(pos, rows, cols);
}

/** Close a two-layer (rows + 1) × cols grid of points (layer 0 then layer 1) into a solid: faces, back faces and the two rims. */
function closeGrid(pos: number[], rows: number, cols: number): BoxMesh {
  const n = (rows + 1) * cols, idx: number[] = [];
  const id = (sh: number, i: number, j: number) => sh * n + i * cols + (j % cols);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    idx.push(id(0, i, j), id(0, i + 1, j + 1), id(0, i + 1, j), id(0, i, j), id(0, i, j + 1), id(0, i + 1, j + 1));
    idx.push(id(1, i, j), id(1, i + 1, j), id(1, i + 1, j + 1), id(1, i, j), id(1, i + 1, j + 1), id(1, i, j + 1));
  }
  for (const [i, f] of [[0, false], [rows, true]] as const) for (let j = 0; j < cols; j++) {
    if (f) idx.push(id(0, i, j), id(1, i, j + 1), id(1, i, j), id(0, i, j), id(0, i, j + 1), id(1, i, j + 1));
    else idx.push(id(0, i, j), id(1, i, j), id(1, i, j + 1), id(0, i, j), id(1, i, j + 1), id(0, i, j + 1));
  }
  return orient({ positions: new Float32Array(pos), index: new Uint32Array(idx) });
}
const cross3 = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: number[]): [number, number, number] => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** (radius, z) section of a spherical shell band about the vertical axis, from elevation e0 to e1 (radians), inner radius r, thickness t. */
export function shellSection(r: Mm, t: Mm, zc: Mm, e0: number, e1: number, steps = 24): [number, number][] {
  const arc = (rad: number) => Array.from({ length: steps + 1 }, (_, k) => { const e = e0 + ((e1 - e0) * k) / steps; return [rad * Math.cos(e), zc + rad * Math.sin(e)] as [number, number]; });
  return [...arc(r), ...arc(r + t).reverse()];
}
/** The structural dome's section: the cap of the interior, domeGap outside the media plane, from the spring to the crown ring. */
export function domeSection(s: SphereEnvelope): [number, number][] {
  const r = s.capR + SPHERE.domeGap;
  return shellSection(r, SPHERE.shell, s.capZ, Math.asin(Math.min(1, (s.springZ - s.capZ) / r)), Math.acos(Math.min(1, s.crownR / r)));
}
/** The Exosphere's diagrid zone (section), from the ground to a small crown opening. */
export function exoSection(s: SphereEnvelope, t: Mm = SPHERE.exoDepth): [number, number][] {
  return shellSection(s.R - t, t, s.zc, Math.asin(-s.zc / (s.R - t)), Math.acos(Math.min(1, 1500 / (s.R - t))), 48);
}

/** The 32 radial dome trusses as polylines over the dome, from the spring to the crown ring. */
export function sphereRibs(s: SphereEnvelope, steps = 10): [number, number, number][][] {
  const rd = s.capR + SPHERE.domeGap + SPHERE.shell + SPHERE.ribDepth / 2;
  const e0 = Math.asin(Math.min(1, (s.springZ - s.capZ) / rd)), e1 = Math.acos(Math.min(1, s.crownR / rd));
  return Array.from({ length: s.ribs }, (_, k) => {
    const az = (2 * Math.PI * k) / s.ribs;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const e = e0 + ((e1 - e0) * i) / steps;
      return [s.cx + Math.cos(az) * Math.cos(e) * rd, s.cy + Math.sin(az) * Math.cos(e) * rd, s.capZ + Math.sin(e) * rd] as [number, number, number];
    });
  });
}

/** Soffit under the lower tier (on grade: down to the ground) at plan offset d. */
function bohSoffit(t: TierProfile, d: Mm) {
  const l = soffitLine(t, t.base);
  if (!l) return d >= t.back ? Infinity : 0;
  if (d >= l.d1) return Infinity;
  if (d <= l.d0) return t.onGrade ? 0 : l.z0;
  return atLine(l, d);
}

// ── geometry ─────────────────────────────────────────────────────────────────────────────

/** A member as a closed solid: its section given a width across the frame (along the path tangent). */
export function memberSolid(ring: PlanRing, m: Member): BoxMesh {
  const st = pointAt(ring, m.seg, m.u, 0);
  // tangent along the path, direction of increasing u (counter-clockwise in plan)
  const tx = -st.ny, ty = st.nx, w = m.width / 2;
  const pos: number[] = [];
  for (const side of [-1, 1]) for (const [d, z] of m.section) {
    const p = pointAt(ring, m.seg, m.u, d);
    pos.push(p.x + tx * w * side, p.y + ty * w * side, z);
  }
  // 0–3 one face of the frame, 4–7 the other; the section runs counter-clockwise seen from +tangent… orient by volume
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7];
  for (let e = 0; e < 4; e++) { const a = e, b = (e + 1) % 4; idx.push(a, b, b + 4, a, b + 4, a + 4); }
  return orient({ positions: new Float32Array(pos), index: new Uint32Array(idx) });
}

/** An axis-aligned box as a closed solid. */
export function boxSolid(min: [number, number, number], max: [number, number, number]): BoxMesh {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const pos = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions: new Float32Array(pos), index: new Uint32Array(idx) };
}

/** The cap over the field: a shallow dome (or flat deck) over the opening at dIn, as a closed slab. */
export function capSolid(ring: PlanRing, d: Mm, z: Mm, rise: Mm, thick = ROOF_SKIN): BoxMesh {
  const edge = stationsAt(ring, d);
  const rings = [1, 0.8, 0.6, 0.4, 0.2];
  const m = edge.length;
  const pos: number[] = [];
  const zr = (s: number) => z + rise * (1 - s * s);
  for (const top of [true, false]) {
    for (const s of rings) for (const q of edge) pos.push(ring.cx + (q[0] - ring.cx) * s, ring.cy + (q[1] - ring.cy) * s, zr(s) - (top ? 0 : thick));
    pos.push(ring.cx, ring.cy, zr(0) - (top ? 0 : thick));
  }
  const half = rings.length * m + 1;
  const idx: number[] = [];
  const quadStrip = (o: number, flip: boolean) => {
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < m; i++) {
      const a = o + r * m + i, b = o + r * m + ((i + 1) % m), c = o + (r + 1) * m + ((i + 1) % m), dd = o + (r + 1) * m + i;
      if (flip) idx.push(a, c, b, a, dd, c); else idx.push(a, b, c, a, c, dd);
    }
    const centre = o + rings.length * m, last = o + (rings.length - 1) * m;
    for (let i = 0; i < m; i++) { const a = last + i, b = last + ((i + 1) % m); if (flip) idx.push(a, centre, b); else idx.push(a, b, centre); }
  };
  quadStrip(0, false);
  quadStrip(half, true);
  for (let i = 0; i < m; i++) { const a = i, b = (i + 1) % m; idx.push(a, half + b, b, a, half + a, half + b); }
  return orient({ positions: new Float32Array(pos), index: new Uint32Array(idx) });
}

/** Plan points of the path at offset d (counter-clockwise, corners subdivided, coincident points dropped). */
export function stationsAt(ring: PlanRing, d: Mm, cornerSteps = 16): [number, number][] {
  const out: [number, number][] = [];
  for (const seg of SEGMENTS) {
    const n = isCorner(seg) ? cornerSteps : 1;
    for (let k = 0; k < n; k++) {
      const q = pointAt(ring, seg, k / n, d);
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(prev[0] - q.x, prev[1] - q.y) > 1) out.push([q.x, q.y]);
    }
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1) out.pop();
  return out;
}

/**
 * Roof skin as closed solids, one per span: the outer deck, and a translucent band along the leading
 * edge (the inner `band` share of the roof depth; 0 for none) so the bowl keeps daylight.
 */
export function roofSkin(ring: PlanRing, r: Roof, band = 0): { deck: BoxMesh[]; edge: BoxMesh[] } {
  const top = (d: Mm) => roofTopAt(r, d);
  const sec = (d0: Mm, d1: Mm): [number, number][] => [[d0, top(d0) - ROOF_SKIN], [d1, top(d1) - ROOF_SKIN], [d1, top(d1)], [d0, top(d0)]];
  const dB = r.dIn + band * (r.dOut - r.dIn);
  return {
    deck: r.spans.map((sp) => sweepSolid(ring, sp, sec(dB, r.dOut))),
    edge: band > 0 ? r.spans.map((sp) => sweepSolid(ring, sp, sec(r.dIn, dB))) : [],
  };
}

/** Top of the roof skin at plan offset d. */
export const roofTopAt = (r: Roof, d: Mm) => r.zTop0 + (r.dOut - EAVE - COLUMN_SETBACK - d) * r.slope;
/** Underside of the roof at plan offset d: under the skin on open roofs, under the hanging frames on enclosed ones. */
export function roofUnderAt(r: Roof, d: Mm) {
  const dCol = r.dOut - EAVE - COLUMN_SETBACK;
  const depth = d >= dCol ? r.depth : r.depth * (0.25 + (0.75 * Math.max(0, d - r.dIn)) / Math.max(1, dCol - r.dIn));
  return roofTopAt(r, d) - ROOF_SKIN - (r.exposed ? 0 : depth);
}

export const pieceSolid = (ring: PlanRing, q: Piece) => bandSolid(ring, { seg: q.seg, u0: q.u0, u1: q.u1 }, q.d0, q.d1, q.z0, q.z1);

/** Flip the winding if the signed volume is negative (faces then wind outward). */
function orient(m: BoxMesh): BoxMesh {
  let v = 0;
  const P = m.positions, I = m.index;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  if (v < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
  return m;
}
