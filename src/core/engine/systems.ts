/**
 * Technical infrastructure (Round 05): field lighting, video and ribbon boards, broadcast positions,
 * MEP space reservations and service access, coordinated with the bowl, building and architecture.
 *
 *   • field lighting: the fixture count comes from the lumen method (E = N·Φ·MF·UF / A) for the target
 *     illuminance over the playing area and run-off, with a generic fixture. Fixtures hang from a
 *     catwalk under the roof's leading edge when the roof rings the field, otherwise from four corner
 *     masts tall enough for the 25° angle from the centre spot. Each fixture is aimed at a point on the
 *     field, spread across it, and its tilt from the vertical is checked against 70°;
 *   • video boards stand behind the back row of both end stands (checked against the roof underside)
 *     or hang over the centre spot from an enclosed roof (checked against the clear height and the
 *     high-ball view); LED ribbons run along the fascia of every upper tier;
 *   • broadcast: a main camera gantry on the main stand at halfway, cameras on the 16 m / 20-yard
 *     lines and behind both goals, a press tribune beside the main camera and an outside-broadcast
 *     compound outside the main stand;
 *   • MEP: risers beside every core, an air-handling room and an electrical / telecom room at every
 *     level by every core, duct zones under the concourse ceilings, a cable tray along the event-level
 *     corridor, and an energy centre (central plant, switchgear, transformers, generators, water and
 *     fire pumps, telecom head end) on the service frontage, sized from Manica planning ratios;
 *   • service access: a truck court at the loading dock frontage and a vehicle tunnel onto the field.
 *
 * Everything here is a conceptual space reservation (standards: manica.lighting, fifa.lighting,
 * manica.boards, manica.broadcast, manica.mep). No product, photometry or engineered system is implied.
 */
import type { Project, StandId } from '../schema';
import type { FieldModel } from '../sports';
import type { Mm } from '../units';
import { arcPieces, EAVE, roofUnderAt, segStart, type Architecture, type Piece } from './architecture';
import type { Building, Span } from './building';
import type { Layout } from './layout';
import { CORNER_NEIGHBOURS, CORNERS, enclosedArea, isCorner, perimeter, pointAt, SECTORS, SECTOR_OF, segmentLength, SEGMENTS, STANDS, type PlanRing, type SegmentId } from './plan';
import type { TierProfile } from './profile';
import type { SeatTable } from './seats';

export type SystemId = 'lighting' | 'hvac' | 'electrical' | 'plumbing' | 'avit' | 'broadcast' | 'site';
export const SYSTEMS: SystemId[] = ['lighting', 'hvac', 'electrical', 'plumbing', 'avit', 'broadcast', 'site'];
export const SYSTEM_LABEL: Record<SystemId, string> = {
  lighting: 'Lighting', hvac: 'HVAC', electrical: 'Electrical', plumbing: 'Plumbing', avit: 'AV / IT', broadcast: 'Broadcast', site: 'Service access',
};
export const SYSTEM_TONE: Record<SystemId, string> = {
  lighting: '#f2c94c', hvac: '#4aa3df', electrical: '#f2994a', plumbing: '#2d6cdf', avit: '#14a3a3', broadcast: '#9b6bd6', site: '#8a9a7b',
};

/** angle above the horizontal at the centre spot to the lowest fixture (FIFA guide, recall) */
export const MIN_LIGHT_ANGLE = 25;
/** largest fixture tilt from the downward vertical before glare (recall) */
export const MAX_TILT = 70;
/** Manica: clearance between the back row's tread and the bottom of an end video board */
export const BOARD_CLEAR_BEHIND = 3000;
/** generic transformer and generator ratings used for counting (placeholders, not products) */
export const TRANSFORMER_KVA = 2500;
export const GENERATOR_KW = 2000;

/** A space reservation or component in the plan frame. */
export interface Zone extends Piece { system: SystemId; kind: string; label: string; area: number }
/** A band along a span of the plan ring (catwalks, duct zones, cable trays). */
export interface Band { id: string; system: SystemId; kind: string; label: string; span: Span; d0: Mm; d1: Mm; z0: Mm; z1: Mm }
/** An axis-aligned box in world coordinates (a centre-hung board). */
export interface SysBox { id: string; system: SystemId; kind: string; label: string; min: [number, number, number]; max: [number, number, number] }
export interface Fixture { id: string; at: [number, number, number]; aim: [number, number, number]; mount: string; /** degrees from the downward vertical */ tilt: number }
export interface Camera { id: string; label: string; eye: [number, number, number]; target: [number, number, number]; /** degrees below the horizontal to the target */ depression: number }

export interface SystemsMetrics {
  lighting: {
    mount: 'roof' | 'masts';
    fixtures: number;
    /** playing area plus run-off, m² */
    litArea: number;
    /** lumen-method estimate of the average maintained horizontal illuminance, lx */
    average: number;
    loadKW: number;
    /** lowest fixture: angle above the horizontal from the centre spot, degrees */
    minAngle: number;
    maxTilt: number; overTilt: number;
    mastHeight: Mm;
  };
  /** clash: height the end boards lost to fit under the roof, or the centre board's reach into the roof */
  boards: { count: number; area: number; ribbon: Mm; maxView: Mm; meanView: Mm; clash: Mm; built: boolean };
  broadcast: { cameras: number; mainDepression: number; mainDistance: Mm; tribuneSeats: number; commentary: number; compound: number };
  mep: {
    conditioned: number; demandKW: number; transformers: number; generators: number;
    plant: number; switchgear: number; substation: number; generatorYard: number; water: number; telecom: number;
    ahu: number; elecRooms: number; risers: number; ductLength: Mm;
  };
  avit: { speakers: number; wifiAPs: number };
  service: { yard: StandId; yardArea: number; yardFit: number; fieldAccess: boolean; dockBays: number };
}

export interface Systems {
  zones: Zone[];
  bands: Band[];
  boxes: SysBox[];
  fixtures: Fixture[];
  cameras: Camera[];
  metrics: SystemsMetrics;
}

/** spectators per Wi-Fi access point in the bowl (Manica planning ratio) */
const SEATS_PER_AP = 75;
/** speaker clusters along the catwalk at this spacing */
const SPEAKER_SPACING = 20000;
const deg = (r: number) => (r * 180) / Math.PI;
const frac = (v: number) => v - Math.floor(v);

/** MEP areas (m²) and loads from Manica planning ratios, scaled by mep.scale. */
export function mepNeeds(p: Project, capacity: number, conditioned: number, loadKW: number) {
  const k = p.systems.mep.scale;
  const demandKW = loadKW + 0.06 * conditioned;
  const transformers = Math.max(2, Math.ceil(demandKW / 0.9 / TRANSFORMER_KVA));
  const generators = Math.max(1, Math.ceil((0.3 * demandKW) / GENERATOR_KW));
  return {
    demandKW, transformers, generators,
    plant: 0.035 * conditioned * k,
    switchgear: (100 + 0.0035 * capacity + 15 * transformers) * k,
    substation: (100 + 60 * transformers) * k,
    generatorYard: (80 + 50 * generators) * k,
    water: (150 + 0.004 * capacity) * k,
    telecom: (80 + 0.0015 * capacity) * k,
  };
}

export function buildSystems(
  p: Project, ring: PlanRing, layout: Layout, profiles: TierProfile[], building: Building, arch: Architecture,
  ctx: { field: FieldModel; seats: SeatTable; capacity: number; skyView: Mm },
): Systems {
  const SY = p.systems;
  const zones: Zone[] = [], bands: Band[] = [], boxes: SysBox[] = [], fixtures: Fixture[] = [], cameras: Camera[] = [];
  const roof = arch.roof, dF = arch.facade.d;
  const fb = ctx.field.boundary, fs = ctx.field.surface;
  const covers = (g: SegmentId) => roof.spans.some((sp) => sp === 'ring' || sp.seg === g);
  const zone = (z: Omit<Zone, 'area'> & { area?: number }): Zone => {
    const len = (z.u1 - z.u0) * segmentLength(ring, z.seg, (z.d0 + z.d1) / 2);
    const o = { ...z, area: z.area ?? (len * (z.d1 - z.d0)) / 1e6 };
    zones.push(o);
    return o;
  };
  /** u-span of a width centred on u at offset d */
  const around = (g: SegmentId, u: number, w: Mm, d: Mm) => { const L = Math.max(1, segmentLength(ring, g, d)); return [Math.max(0, u - w / 2 / L), Math.min(1, u + w / 2 / L)] as const; };

  // back of the bowl and its top row in each region
  const reach = {} as Record<SegmentId, { d: Mm; z: Mm }>;
  for (const g of SEGMENTS) {
    let d = 0, z = 0;
    profiles.forEach((t) => { const n = layout.rows[g][t.index]; if (n > 0) { const r = t.rows[Math.min(n, t.rows.length) - 1]; d = Math.max(d, r.d + t.rowDepth); z = Math.max(z, r.z); } });
    reach[g] = { d, z };
  }

  // ── field lighting
  const L = SY.lighting;
  const litArea = ((fs.maxX - fs.minX) * (fs.maxY - fs.minY)) / 1e6;
  const N = Math.max(4, Math.ceil((L.target * litArea) / Math.max(1, L.lumens * L.maintenance * L.utilisation)));
  const ringed = roof.type !== 'open' && STANDS.every((g) => covers(g) || segmentLength(ring, g, 0) < 1000);
  // a spherical envelope: production lighting rigs from the dome through the media plane, so no floodlights are planned
  const sphere = arch.sphere;
  const mount: 'roof' | 'masts' = sphere ? 'roof' : L.mount === 'masts' || !ringed ? 'masts' : 'roof';
  const spread = (k: number) => [0.08 + 0.84 * frac(k * 0.6180339887), 0.08 + 0.84 * frac(k * 0.4142135624 + 0.5)];
  let mastHeight = 0;
  const dCat = roof.dIn + 1500;
  const zCat = mount === 'roof' ? roofUnderAt(roof, dCat) - 1500 : 0;
  if (sphere) {
    // the main loudspeaker array: 14 clusters in an arc 25–30 ft above the stage (published), placeholders
    const st = ctx.field.stage;
    if (st) {
      const y0 = st.rect.minY, y1 = st.rect.maxY, x = st.rect.minX + 1500, z = st.z + 8400;
      for (let k = 0; k < 14; k++) {
        const y = y0 + ((y1 - y0) * (k + 0.5)) / 14, bow = 2500 * (1 - (2 * (k + 0.5) / 14 - 1) ** 2);
        boxes.push({ id: `AV.ARRAY.${String(k + 1).padStart(2, '0')}`, system: 'avit', kind: 'speaker', label: 'Main loudspeaker cluster', min: [x - bow - 600, y - 700, z], max: [x - bow + 600, y + 700, z + 2400] });
      }
    }
  } else if (mount === 'roof') {
    for (const sp of roof.spans) bands.push({ id: `LGT.CATWALK${sp === 'ring' ? '' : `.${sp.seg}`}`, system: 'lighting', kind: 'catwalk', label: 'Lighting catwalk', span: sp, d0: dCat - 700, d1: dCat + 700, z0: zCat - 150, z1: zCat });
    // more fixtures on the long sides than on the ends
    const segs = STANDS.filter((g) => covers(g) && segmentLength(ring, g, dCat) > 1000);
    const w = segs.map((g) => segmentLength(ring, g, dCat) * (g === 'N' || g === 'S' ? 1 : 0.6));
    const W = w.reduce((a, v) => a + v, 0);
    const counts = w.map((v) => Math.floor((N * v) / W));
    for (let r = N - counts.reduce((a, v) => a + v, 0), i = 0; r > 0; r--, i = (i + 1) % counts.length) counts[i]++;
    segs.forEach((g, si) => {
      const n = counts[si], len = segmentLength(ring, g, dCat);
      const cols = Math.max(1, Math.min(n, Math.floor((len * 0.9) / 900)));
      for (let k = 0; k < n; k++) {
        const c = k % cols, row = Math.floor(k / cols);
        const q = pointAt(ring, g, 0.05 + (0.9 * (c + 0.5)) / cols, dCat - 300);
        const at: [number, number, number] = [q.x, q.y, zCat - 700 - row * 800];
        const [fa] = spread(k);
        const clampX = Math.min(fb.maxX, Math.max(fb.minX, at[0])) * 0.95, clampY = Math.min(fb.maxY, Math.max(fb.minY, at[1])) * 0.95;
        const aim: [number, number, number] = g === 'N' ? [clampX, fb.maxY - (fb.maxY - fb.minY) * fa, 0]
          : g === 'S' ? [clampX, fb.minY + (fb.maxY - fb.minY) * fa, 0]
            : g === 'E' ? [fb.maxX - (fb.maxX - fb.minX) * fa, clampY, 0] : [fb.minX + (fb.maxX - fb.minX) * fa, clampY, 0];
        fixtures.push({ id: `LGT.${g}.${String(k + 1).padStart(3, '0')}`, at, aim, mount: 'catwalk', tilt: 0 });
      }
    });
  } else {
    // four masts behind the corners of the bowl, tall enough for the angle from the centre spot
    const top = Math.max(arch.metrics.facadeTop, arch.metrics.roofTop);
    const per = Math.ceil(N / 4), cols = 14, rows = Math.ceil(per / cols);
    const headH = rows * 900 + 1000;
    CORNERS.forEach((g, gi) => {
      const dM = Math.max(reach[g].d, ...CORNER_NEIGHBOURS[g].map((s) => reach[s].d)) + 5000;
      const q = pointAt(ring, g, 0.5, dM);
      const dist = Math.hypot(q.x - ring.cx, q.y - ring.cy);
      const H = Math.ceil(Math.max(Math.tan(((MIN_LIGHT_ANGLE + 3) * Math.PI) / 180) * dist + headH, top + headH + 3000) / 1000) * 1000;
      mastHeight = Math.max(mastHeight, H);
      const [s0, s1] = around(g, 0.5, 3000, dM);
      zone({ id: `LGT.MAST.${g}`, system: 'lighting', kind: 'mast', label: 'Floodlight mast', seg: g, u0: s0, u1: s1, d0: dM - 1500, d1: dM + 1500, z0: 0, z1: H - headH });
      const [h0, h1] = around(g, 0.5, 14000, dM - 2000);
      zone({ id: `LGT.HEAD.${g}`, system: 'lighting', kind: 'head', label: 'Mast head frame', seg: g, u0: h0, u1: h1, d0: dM - 2500, d1: dM - 1500, z0: H - headH, z1: H });
      const sx = Math.sign(q.x - ring.cx) || 1, sy = Math.sign(q.y - ring.cy) || 1;
      const n = Math.min(per, N - gi * per);
      for (let k = 0; k < n; k++) {
        const c = k % cols, row = Math.floor(k / cols);
        const s = pointAt(ring, g, h0 + ((h1 - h0) * (c + 0.5)) / cols, dM - 2800);
        const [fa, fbb] = spread(k + gi * 7);
        const aim: [number, number, number] = [ring.cx + sx * fb.maxX * (1 - 1.6 * fa), ring.cy + sy * fb.maxY * (1 - 1.6 * fbb), 0];
        fixtures.push({ id: `LGT.${g}.${String(k + 1).padStart(3, '0')}`, at: [s.x, s.y, H - 500 - row * 900], aim, mount: `mast ${g}`, tilt: 0 });
      }
    });
  }
  let minAngle = 90, maxTilt = 0, overTilt = 0;
  for (const f of fixtures) {
    f.tilt = deg(Math.atan2(Math.hypot(f.aim[0] - f.at[0], f.aim[1] - f.at[1]), f.at[2] - f.aim[2]));
    maxTilt = Math.max(maxTilt, f.tilt);
    if (f.tilt > MAX_TILT) overTilt++;
    minAngle = Math.min(minAngle, deg(Math.atan2(f.at[2], Math.hypot(f.at[0] - ring.cx, f.at[1] - ring.cy))));
  }
  const loadLighting = (fixtures.length * L.watts) / 1000;

  // ── video and ribbon boards
  const B = SY.boards;
  let boardArea = 0, clash = 0, built = B.type !== 'none';
  const faces: [number, number, number][] = [];
  if (B.type === 'ends') {
    for (const g of ['E', 'W'] as SegmentId[]) {
      const Lg = segmentLength(ring, g, reach[g].d);
      if (Lg < 2000) continue;
      const w = Math.min(B.width, Lg * 0.9);
      const d0 = Math.max(reach[g].d, 4000) + 1000, z0 = (reach[g].d ? reach[g].z : 0) + BOARD_CLEAR_BEHIND + (reach[g].d ? 0 : 5000);
      const [u0, u1] = around(g, 0.5, w, d0);
      // under a roof the board is cut to fit 0.5 m below the structure
      const room = covers(g) ? Math.min(roofUnderAt(roof, d0), roofUnderAt(roof, d0 + 1600)) - 500 - z0 : Infinity;
      const h = Math.max(0, Math.min(B.height, room));
      clash = Math.max(clash, B.height - h);
      if (h < 1000) continue;
      zone({ id: `AV.BOARD.${g}`, system: 'avit', kind: 'board', label: 'Video board', seg: g, u0, u1, d0, d1: d0 + 600, z0, z1: z0 + h, area: (w * h) / 1e6 });
      zone({ id: `AV.BOARD.${g}.FRAME`, system: 'avit', kind: 'boardFrame', label: 'Board support frame', seg: g, u0, u1, d0: d0 + 600, d1: d0 + 1600, z0: Math.max(0, z0 - BOARD_CLEAR_BEHIND), z1: z0 + h, area: 0 });
      boardArea += (w * h) / 1e6;
      const c = pointAt(ring, g, 0.5, d0);
      faces.push([c.x, c.y, z0 + h / 2]);
    }
  } else if (B.type === 'centre') {
    // hangs from an enclosed roof's cap or trusses; open and retractable roofs have nothing over the field
    built = !!roof.cap;
    if (built) {
      const w = B.width, dd = B.width * 0.6;
      boxes.push({ id: 'AV.BOARD.CENTRE', system: 'avit', kind: 'centreBoard', label: 'Centre-hung video board', min: [ring.cx - w / 2, ring.cy - dd / 2, B.clear], max: [ring.cx + w / 2, ring.cy + dd / 2, B.clear + B.height] });
      boardArea += (2 * (w + dd) * B.height) / 1e6;
      faces.push([ring.cx, ring.cy, B.clear + B.height / 2]);
      clash = Math.max(0, B.clear + B.height - arch.metrics.viewClear);
    }
  }
  let ribbon = 0;
  if (B.ribbon) profiles.forEach((t, ti) => {
    if (ti === 0) return;
    for (const g of SEGMENTS) {
      if (layout.rows[g][t.index] <= 0 || segmentLength(ring, g, t.front) < 500) continue;
      zone({ id: `AV.RIBBON.${t.id}.${g}`, system: 'avit', kind: 'ribbon', label: 'LED ribbon board', seg: g, u0: 0, u1: 1, d0: t.front - 250, d1: t.front - 50, z0: t.bottom - 1100, z1: t.bottom - 200, area: (segmentLength(ring, g, t.front) * 900) / 1e6 });
      ribbon += segmentLength(ring, g, t.front);
    }
  });
  // viewing distance from the seats to the nearest board
  let maxView = 0, sumView = 0, nView = 0;
  const st = ctx.seats;
  if (faces.length) for (let i = 0; i < st.count; i += 7) {
    if (st.status[i] !== 0) continue;
    let best = Infinity;
    for (const f of faces) best = Math.min(best, Math.hypot(st.x[i] - f[0], st.y[i] - f[1], st.z[i] + 1200 - f[2]));
    maxView = Math.max(maxView, best); sumView += best; nView++;
  }

  // ── speakers along the catwalk, Wi-Fi from the seat count
  let speakers = boxes.filter((b) => b.kind === 'speaker').length;
  if (mount === 'roof') for (const sp of roof.spans) {
    for (const g of sp === 'ring' ? SEGMENTS : [sp.seg]) {
      const len = segmentLength(ring, g, dCat);
      if (len < 3000) continue;
      const n = Math.max(1, Math.round(len / SPEAKER_SPACING));
      for (let k = 0; k < n; k++) {
        const [u0, u1] = around(g, (k + 0.5) / n, 1500, dCat);
        zone({ id: `AV.SPK.${g}.${k + 1}`, system: 'avit', kind: 'speaker', label: 'Speaker cluster', seg: g, u0, u1, d0: dCat + 300, d1: dCat + 1500, z0: zCat - 3800, z1: zCat - 300, area: 0 });
        speakers++;
      }
    }
  }

  // ── broadcast
  const main = p.architecture.boh.mainStand as SegmentId;
  const gantry = (g: SegmentId) => {
    const t = profiles.find((x) => x.index > 0 && layout.rows[g][x.index] > 0);
    if (t) return { t, d0: t.front - 2500, d1: t.front, z: t.bottom, eyeD: t.front - 1300 };
    const t0 = profiles[0], n = layout.rows[g][0];
    const r = t0.rows[Math.max(0, Math.min(n, t0.rows.length) - 1)];
    const back = n > 0 ? r.d + t0.rowDepth : 2000;
    return { t: t0, d0: back, d1: back + 2500, z: n > 0 ? r.z : 0, eyeD: back + 1200 };
  };
  const uAtX = (g: SegmentId, x: number) => { const a = pointAt(ring, g, 0, 0).x, b = pointAt(ring, g, 1, 0).x; return Math.abs(b - a) < 1 ? 0.5 : Math.min(0.95, Math.max(0.05, (x - a) / (b - a))); };
  const lineX = p.sport === 'nfl' ? fb.maxX - 9144 - 18288 : fb.maxX - 16500; // 20-yard lines (10-yard end zones) / 16.5 m lines
  const camAt = (id: string, label: string, g: SegmentId, u: number, w: Mm, target: [number, number, number]) => {
    const gy = gantry(g);
    const [u0, u1] = around(g, u, w, gy.d0);
    zone({ id: `BRD.${id}`, system: 'broadcast', kind: 'camera', label, seg: g, u0, u1, d0: gy.d0, d1: gy.d1, z0: gy.z - 500, z1: gy.z });
    const e = pointAt(ring, g, u, gy.eyeD);
    const eye: [number, number, number] = [e.x, e.y, gy.z + 1600];
    cameras.push({ id: `BRD.${id}`, label, eye, target, depression: deg(Math.atan2(eye[2] - target[2], Math.hypot(target[0] - eye[0], target[1] - eye[1]))) });
  };
  const sideStand = main === 'N' || main === 'S';
  camAt('MAIN', 'Main camera gantry', main, 0.5, 8000, [ring.cx, ring.cy, 0]);
  for (const sx of [-1, 1]) camAt(`LINE_${sx < 0 ? 'W' : 'E'}`, p.sport === 'nfl' ? '20-yard line camera' : '16 m line camera', main, sideStand ? uAtX(main, sx * lineX) : 0.5 + sx * 0.3, 4000, [sx * lineX, ring.cy, 0]);
  for (const g of ['E', 'W'] as SegmentId[]) if (segmentLength(ring, g, 0) > 2000) camAt(`GOAL_${g}`, 'High camera behind the goal', g, 0.5, 4000, [ring.cx, ring.cy, 0]);
  const mainCam = cameras[0];
  const nearLine = main === 'N' ? fb.maxY : main === 'S' ? fb.minY : main === 'E' ? fb.maxX : fb.minX;
  const mainDistance = sideStand ? Math.abs(mainCam.eye[1] - nearLine) : Math.abs(mainCam.eye[0] - nearLine);
  // press tribune: the front rows of the gantry tier beside the main camera; its seats are counted, not removed
  const gy = gantry(main);
  const tw = Math.ceil(SY.broadcast.commentary / 2) * 1800;
  let tribuneSeats = 0;
  if (SY.broadcast.commentary > 0 && gy.t.rows.length > 2) {
    const t = gy.t;
    const [u0, u1] = around(main, 0.5, tw + 8000, t.front);
    zone({ id: 'BRD.TRIBUNE', system: 'broadcast', kind: 'tribune', label: 'Press tribune', seg: main, u0, u1, d0: t.front, d1: t.front + 2 * t.rowDepth, z0: t.bottom, z1: t.rows[1].z + 1200 });
    const a = pointAt(ring, main, u0, t.front), b = pointAt(ring, main, u1, t.front);
    const sec = SECTORS.indexOf(SECTOR_OF[main]);
    for (let i = 0; i < st.count; i++) {
      if (st.status[i] !== 0 || st.tier[i] !== t.index || st.sector[i] !== sec || st.row[i] > 2) continue;
      const v = sideStand ? st.x[i] : st.y[i], lo = Math.min(sideStand ? a.x : a.y, sideStand ? b.x : b.y), hi = Math.max(sideStand ? a.x : a.y, sideStand ? b.x : b.y);
      if (v >= lo && v <= hi) tribuneSeats++;
    }
  }

  // ── exterior frontage: service yard, energy centre and the broadcast compound
  const loadBoh = arch.boh.zones.find((z) => z.kind === 'loading');
  const yard: StandId = SY.service.yard !== 'auto' ? SY.service.yard
    : loadBoh && !isCorner(loadBoh.seg) && loadBoh.seg !== main ? (loadBoh.seg as StandId)
      : ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[main as StandId];
  const dPad = dF + EAVE + 3000;
  const boardKW = boardArea * 0.3 + (ribbon / 1000) * 0.9 * 0.3;
  // an enclosed bowl is conditioned too: its plan area counts at half the room ratio
  const conditioned = arch.metrics.grossArea + (roof.cap ? (0.5 * enclosedArea(ring, Math.max(...SEGMENTS.map((g) => reach[g].d)))) / 1e6 : 0);
  const mep = mepNeeds(p, ctx.capacity, conditioned, loadLighting + boardKW);
  const bays = Math.max(1, SY.service.dockBays);
  const pads: { id: string; system: SystemId; kind: string; label: string; area: number; depth: Mm; h: Mm }[] = [
    { id: 'SITE.SERVICE_YARD', system: 'site', kind: 'yard', label: 'Service yard (truck court)', area: ((bays * 4500 + 8000) * 36000) / 1e6, depth: 36000, h: 150 },
    { id: 'HVAC.CENTRAL_PLANT', system: 'hvac', kind: 'plant', label: 'Central plant', area: mep.plant, depth: 24000, h: 9000 },
    { id: 'ELE.SWITCHGEAR', system: 'electrical', kind: 'switchgear', label: 'Main switchgear', area: mep.switchgear, depth: 24000, h: 6000 },
    { id: 'ELE.SUBSTATION', system: 'electrical', kind: 'substation', label: 'Transformer yard', area: mep.substation, depth: 24000, h: 3500 },
    { id: 'ELE.GENERATORS', system: 'electrical', kind: 'generators', label: 'Generator yard', area: mep.generatorYard, depth: 24000, h: 4500 },
    { id: 'PLB.WATER', system: 'plumbing', kind: 'water', label: 'Water storage & fire pumps', area: mep.water, depth: 24000, h: 7000 },
    { id: 'AV.TELECOM', system: 'avit', kind: 'telecom', label: 'Telecom head end (MDF)', area: mep.telecom, depth: 24000, h: 5000 },
  ];
  const gap = 3000;
  // pads run along the stand's frontage and on round half of each corner beside it
  const per = perimeter(ring, dPad);
  const layPads = (g: SegmentId, list: typeof pads) => {
    const Lg = segmentLength(ring, g, dPad), i = SEGMENTS.indexOf(g);
    const side = (segmentLength(ring, SEGMENTS[(i + 7) % 8], dPad) + segmentLength(ring, SEGMENTS[(i + 1) % 8], dPad)) / 2;
    const avail = (Lg + side) * 0.95;
    const want = list.reduce((a, q) => a + (q.area * 1e6) / q.depth + gap, -gap);
    const k = Math.min(1, avail / Math.max(1, want));
    let s = segStart(ring, dPad, g) + Lg / 2 - (want * k) / 2;
    for (const q of list) {
      const l = ((q.area * 1e6) / q.depth) * k;
      const base = s < 0 ? s + per : s;
      const parts = arcPieces(ring, dPad, base, base + l);
      parts.forEach((r, j) => zone({ id: `${q.id}${parts.length > 1 ? `.${j + 1}` : ''}`, system: q.system, kind: q.kind, label: q.label, seg: r.seg, u0: r.u0, u1: r.u1, d0: dPad, d1: dPad + q.depth, z0: 0, z1: q.h, area: (q.area * k * (r.u1 - r.u0) * segmentLength(ring, r.seg, dPad)) / Math.max(1, l) }));
      s += l + gap * k;
    }
    return k;
  };
  const compound = { id: 'BRD.COMPOUND', system: 'broadcast' as SystemId, kind: 'compound', label: 'Outside-broadcast compound', area: SY.broadcast.compound, depth: 30000, h: 4500 };
  const yardFit = layPads(yard, yard === main ? [...pads, compound] : pads);
  if (yard !== main) layPads(main, [compound]);

  // ── field access: a vehicle tunnel from the facade through the lower tier to the field edge
  const fa = SY.service.fieldAccess;
  if (fa !== 'none' && segmentLength(ring, fa, 0) > 8000) {
    const u = fa === main ? 0.5 + 16000 / segmentLength(ring, fa, 0) : 0.5;
    const [u0, u1] = around(fa, u, 6000, 0);
    zone({ id: 'SITE.FIELD_ACCESS', system: 'site', kind: 'fieldAccess', label: 'Field access tunnel', seg: fa, u0, u1, d0: -Math.min(4000, ring.dist[fa] - 1000), d1: dF, z0: 0, z1: 5000 });
  }

  // ── MEP at the cores: risers on one side, air handling and electrical / telecom rooms on the other
  let ahu = 0, elecRooms = 0, risers = 0;
  for (const c of building.cores) {
    const dm = (c.d0 + c.d1) / 2, Lc = Math.max(1, segmentLength(ring, c.seg, dm)), D = c.d1 - c.d0;
    let r0 = c.u1 + 600 / Lc, r1 = r0 + 3000 / Lc, m1 = c.u0 - 600 / Lc, m0 = m1 - 6000 / Lc;
    if (r1 > 1) { r1 = m1; r0 = r1 - 3000 / Lc; m1 = r0 - 600 / Lc; m0 = m1 - 6000 / Lc; }
    if (m0 < 0) { m0 = c.u1 + 600 / Lc + (r1 <= c.u0 ? 0 : 3600 / Lc); m1 = m0 + 6000 / Lc; }
    if (m1 > 1 || r0 < 0) continue;
    const parts: [string, string, SystemId, number, number][] = [['DUCT', 'Duct riser', 'hvac', 0, 0.45], ['ELEC', 'Electrical riser', 'electrical', 0.45, 0.7], ['PLMB', 'Plumbing riser', 'plumbing', 0.7, 1]];
    for (const [id, label, sys, a, b] of parts) {
      zone({ id: `${sys === 'hvac' ? 'HVAC' : sys === 'electrical' ? 'ELE' : 'PLB'}.RISER.${id}.${c.id}`, system: sys, kind: 'riser', label, seg: c.seg, u0: r0, u1: r1, d0: c.d0 + D * a, d1: c.d0 + D * b, z0: 0, z1: c.zTop });
      risers += (3000 * D * (b - a)) / 1e6;
    }
    for (const l of building.levels) {
      if (l.z + 3500 > c.zTop) continue;
      ahu += zone({ id: `HVAC.AHU.${l.id}.${c.id}`, system: 'hvac', kind: 'ahu', label: 'Air-handling room', seg: c.seg, u0: m0, u1: m1, d0: c.d0, d1: c.d0 + D * 0.65, z0: l.z, z1: l.z + 3500 }).area;
      elecRooms += zone({ id: `ELE.ROOM.${l.id}.${c.id}`, system: 'electrical', kind: 'elecRoom', label: 'Electrical & telecom room', seg: c.seg, u0: m0, u1: m1, d0: c.d0 + D * 0.65, d1: c.d1, z0: l.z, z1: l.z + 3500 }).area;
    }
  }
  // duct zones under the concourse ceilings, a cable tray along the event-level corridor
  let ductLength = 0;
  const clear = p.building.concourseClear, dz = SY.mep.ductZone;
  for (const l of building.levels) {
    if (l.kind !== 'concourse') continue;
    bands.push({ id: `HVAC.DUCT.${l.id}`, system: 'hvac', kind: 'duct', label: 'Duct distribution zone', span: 'ring', d0: l.circ[0], d1: l.circ[1], z0: l.z + clear - dz, z1: l.z + clear - 100 });
    ductLength += perimeter(ring, (l.circ[0] + l.circ[1]) / 2);
  }
  const cor = arch.boh.corridor;
  if (cor) bands.push({ id: 'ELE.CABLE_TRAY', system: 'electrical', kind: 'tray', label: 'Cable tray (event level)', span: 'ring', d0: cor.d1 - 900, d1: cor.d1 - 300, z0: arch.metrics.bohHeight - 800, z1: arch.metrics.bohHeight - 450 });

  return {
    zones, bands, boxes, fixtures, cameras,
    metrics: {
      lighting: {
        mount, fixtures: fixtures.length, litArea,
        average: (fixtures.length * L.lumens * L.maintenance * L.utilisation) / Math.max(1, litArea),
        loadKW: loadLighting, minAngle: fixtures.length ? minAngle : 0, maxTilt, overTilt, mastHeight,
      },
      boards: { count: faces.length, area: boardArea, ribbon, maxView, meanView: nView ? sumView / nView : 0, clash, built },
      broadcast: { cameras: cameras.length, mainDepression: mainCam.depression, mainDistance, tribuneSeats, commentary: SY.broadcast.commentary, compound: SY.broadcast.compound },
      mep: {
        conditioned, demandKW: mep.demandKW, transformers: mep.transformers, generators: mep.generators,
        plant: mep.plant * yardFit, switchgear: mep.switchgear * yardFit, substation: mep.substation * yardFit, generatorYard: mep.generatorYard * yardFit,
        water: mep.water * yardFit, telecom: mep.telecom * yardFit, ahu, elecRooms, risers, ductLength,
      },
      avit: { speakers, wifiAPs: Math.ceil(ctx.capacity / SEATS_PER_AP) },
      service: { yard, yardArea: pads[0].area * yardFit, yardFit, fieldAccess: zones.some((z) => z.kind === 'fieldAccess'), dockBays: bays },
    },
  };
}
