/**
 * The BIM element model (Round 06): one flat list of classified, identified elements built from the
 * resolved Stadium, shared by every professional export (IFC, glTF, DXF), the quantity schedules and
 * the model check — so they all describe the same objects with the same ids.
 *
 * Each element carries
 *   • its MANICAI id (stable across exports and regenerations of the same project), name and layer;
 *   • an IFC class, predefined type and object type, and an aggregate parent (the roof, the facade);
 *   • a model status that keeps actual building elements apart from conceptual masses, space
 *     reservations and generic placeholders (brief §13);
 *   • exact geometry where the form allows it — plan extrusions bounded by lines and true arcs, section
 *     sweeps, corner revolves, boxes, tubes — and a tessellated mesh only for doubly curved or sloped
 *     surfaces (roof deck, cap, vomitory openings);
 *   • a closed triangle mesh of the same object, built by the engine's own solid helpers where they
 *     exist, so exact and tessellated volumes can be compared independently (model check).
 *
 * Seats (tens of thousands of instances of a few generic families) and floodlights (aimed instances of
 * one family) stay as tables and are written as typed instances by each exporter.
 */
import { BOH_LABEL, boxSolid, capSolid, domeSection, exoSection, pieceSolid, ROOF_LABEL, roofSkin, screenSolid, shellSection, SPHERE, sphereRibs, type Piece } from '../core/engine/architecture';
import { bandSolid, PROGRAM_LABEL, SLAB, type BoxMesh, type Span } from '../core/engine/building';
import { isCorner, pointAt, SEGMENTS, type PlanRing, type SegmentId } from '../core/engine/plan';
import { tierOutline } from '../core/engine/profile';
import { earcut } from '../core/engine/sweep';
import type { Stadium } from '../core/engine/stadium';

export type V2 = [number, number];
export type V3 = [number, number, number];

/** A closed plan loop: edge i runs pts[i] → pts[i+1] (wrapping), as a line or, when mids[i] is set, a circular arc through it. */
export interface Loop { pts: V2[]; mids: (V2 | null)[] }

export type Shape =
  /** plan loop (with holes) extruded vertically from z0 to z1 */
  | { kind: 'plan'; outer: Loop; holes: Loop[]; z0: number; z1: number }
  /** (a, b) section in a local frame — a along `x`, b up — extruded along `dir` by `depth` from `origin` */
  | { kind: 'sweep'; origin: V3; x: V2; dir: V2; section: V2[]; depth: number }
  /** (radius, z) section revolved counter-clockwise (seen from above) about the vertical through `centre`, starting along `x` */
  | { kind: 'revolve'; centre: V3; x: V2; section: V2[]; angle: number }
  | { kind: 'box'; min: V3; max: V3 }
  | { kind: 'tube'; from: V3; to: V3; r: number }
  | { kind: 'mesh'; mesh: BoxMesh };

/**
 * How far the element is from a buildable object (brief §13: separate actual BIM objects from
 * conceptual proxy geometry and generic masses).
 */
export type ModelStatus = 'element' | 'mass' | 'reservation' | 'placeholder';
export const STATUS_LABEL: Record<ModelStatus, string> = {
  element: 'Generic parametric element (conceptual size)',
  mass: 'Conceptual mass (form only)',
  reservation: 'Space reservation',
  placeholder: 'Generic placeholder (not a manufacturer product)',
};

export interface BimElement {
  id: string;
  name: string;
  /** MANICAI layer path (as in the Rhino export) */
  layer: string;
  /** schedule category */
  category: string;
  ifc: { cls: string; type: string; objectType?: string };
  /** aggregate this element belongs to ('ROOF', 'FACADE') */
  parent?: string;
  /** element this one cuts (vomitory openings) */
  voids?: string;
  status: ModelStatus;
  shapes: Shape[];
  /** closed triangle mesh of the same object */
  mesh: () => BoxMesh;
  /** level of the element's base, for storey assignment */
  base: number;
  /** spaces: net floor area, m², and whether outside the envelope */
  space?: { area: number; external: boolean; height: number };
  props: Record<string, string | number | boolean>;
}

export interface Aggregate { id: string; name: string; ifc: { cls: string; type: string; objectType?: string }; layer: string; status: ModelStatus; base: number; props: Record<string, string | number | boolean> }

export interface Storey { id: string; name: string; elevation: number }

export interface BimModel {
  elements: BimElement[];
  aggregates: Aggregate[];
  storeys: Storey[];
}

// ── loops ────────────────────────────────────────────────────────────────────────────────

const xy = (ring: PlanRing, seg: SegmentId, u: number, d: number): V2 => { const p = pointAt(ring, seg, u, d); return [p.x, p.y]; };

/** Drop zero-length edges (an edge collapsing to a point keeps the following edge's arc). */
function clean(l: Loop): Loop {
  const pts: V2[] = [], mids: (V2 | null)[] = [];
  l.pts.forEach((p, i) => {
    const q = pts[pts.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.5) { mids[mids.length - 1] = l.mids[i]; return; }
    pts.push(p); mids.push(l.mids[i]);
  });
  while (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.5) { pts.pop(); mids.pop(); }
  return { pts, mids };
}

/** The whole path at plan offset d: straights and true corner arcs, counter-clockwise from the east end. */
export function ringLoop(ring: PlanRing, d: number): Loop {
  const pts: V2[] = [], mids: (V2 | null)[] = [];
  for (const seg of SEGMENTS) {
    if (isCorner(seg)) {
      pts.push(xy(ring, seg, 0, d));
      mids.push(ring.r + d >= 1 ? xy(ring, seg, 0.5, d) : null);
    } else {
      pts.push(xy(ring, seg, 0, d)); mids.push(null);
    }
  }
  return clean({ pts, mids });
}

/** A plan piece (seg, u0..u1, d0..d1) outline: lines on the straights, arcs in the corners. */
export function pieceLoop(ring: PlanRing, seg: SegmentId, u0: number, u1: number, d0: number, d1: number): Loop {
  const c = isCorner(seg), um = (u0 + u1) / 2;
  return clean({
    pts: [xy(ring, seg, u0, d0), xy(ring, seg, u1, d0), xy(ring, seg, u1, d1), xy(ring, seg, u0, d1)],
    mids: [c && ring.r + d0 >= 1 ? xy(ring, seg, um, d0) : null, null, c && ring.r + d1 >= 1 ? xy(ring, seg, um, d1) : null, null],
  });
}

/** Circle through three points. */
export function circle3(a: V2, m: V2, b: V2): { c: V2; r: number } | null {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, m2 = m[0] ** 2 + m[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2;
  const c: V2 = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
  return { c, r: Math.hypot(a[0] - c[0], a[1] - c[1]) };
}

/** Signed sweep (radians, CCW positive) of the arc a → m → b. */
export function arcSweep(a: V2, m: V2, b: V2): { c: V2; r: number; a0: number; sweep: number } | null {
  const k = circle3(a, m, b);
  if (!k) return null;
  const ang = (p: V2) => Math.atan2(p[1] - k.c[1], p[0] - k.c[0]);
  const a0 = ang(a), am = ang(m), a1 = ang(b);
  const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccw = norm(am - a0) < norm(a1 - a0);
  const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
  return { c: k.c, r: k.r, a0, sweep };
}

/** Points along the loop (arcs sampled every ≤ 3.75°), without repeating the first. */
export function sampleLoop(l: Loop, step = Math.PI / 48): V2[] {
  const out: V2[] = [];
  l.pts.forEach((p, i) => {
    out.push(p);
    const m = l.mids[i];
    if (!m) return;
    const q = l.pts[(i + 1) % l.pts.length];
    const a = arcSweep(p, m, q);
    if (!a) return;
    const n = Math.max(2, Math.ceil(Math.abs(a.sweep) / step));
    for (let k = 1; k < n; k++) { const t = a.a0 + (a.sweep * k) / n; out.push([a.c[0] + a.r * Math.cos(t), a.c[1] + a.r * Math.sin(t)]); }
  });
  return out;
}

/** Exact signed area of a loop (lines and arcs), mm², CCW positive. */
export function loopArea(l: Loop): number {
  let A = 0;
  const n = l.pts.length;
  for (let i = 0; i < n; i++) {
    const p = l.pts[i], q = l.pts[(i + 1) % n], m = l.mids[i];
    A += (p[0] * q[1] - q[0] * p[1]) / 2;
    if (m) {
      const a = arcSweep(p, m, q);
      if (a) A += (a.r * a.r / 2) * (a.sweep - Math.sin(a.sweep)) * 1; // circular segment, signed with the sweep
    }
  }
  return A;
}

export const polyArea = (p: V2[]) => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + (q[0] * r[1] - r[0] * q[1]) / 2; }, 0);
const polyCentroid = (p: V2[]): V2 => {
  let cx = 0, cy = 0, a = 0;
  p.forEach((q, i) => { const r = p[(i + 1) % p.length]; const k = q[0] * r[1] - r[0] * q[1]; a += k; cx += (q[0] + r[0]) * k; cy += (q[1] + r[1]) * k; });
  return [cx / (3 * a), cy / (3 * a)];
};

// ── exact volumes and meshes ───────────────────────────────────────────────────────────────

/** Exact (or, for meshes, divergence-theorem) volume of a shape, mm³. */
export function shapeVolume(s: Shape): number {
  switch (s.kind) {
    case 'plan': return (Math.abs(loopArea(s.outer)) - s.holes.reduce((a, h) => a + Math.abs(loopArea(h)), 0)) * (s.z1 - s.z0);
    case 'sweep': return Math.abs(polyArea(s.section)) * s.depth;
    case 'revolve': { const A = Math.abs(polyArea(s.section)); return A * polyCentroid(s.section)[0] * s.angle; }
    case 'box': return (s.max[0] - s.min[0]) * (s.max[1] - s.min[1]) * (s.max[2] - s.min[2]);
    case 'tube': return Math.PI * s.r * s.r * Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]);
    case 'mesh': return meshVolume(s.mesh);
  }
}

export function meshVolume(m: BoxMesh): number {
  let v = 0;
  const P = m.positions, I = m.index;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return v / 6;
}

function orient(m: BoxMesh): BoxMesh {
  if (meshVolume(m) < 0) for (let k = 0; k < m.index.length; k += 3) { const t = m.index[k + 1]; m.index[k + 1] = m.index[k + 2]; m.index[k + 2] = t; }
  return m;
}

/**
 * A polygon section carried through stations 0..m by `place(k, a, b)`: side quads between stations
 * and ear-clipped caps at both ends, wound outward.
 */
function prism(section: V2[], m: number, place: (k: number, a: number, b: number) => V3): BoxMesh {
  const sec = polyArea(section) < 0 ? [...section].reverse() : section;
  const n = sec.length, pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= m; k++) for (const [a, b] of sec) pos.push(...place(k, a, b));
  for (let k = 0; k < m; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + ((i + 1) % n), d = (k + 1) * n + i;
    idx.push(a, b, c, a, c, d);
  }
  const tris = earcut(sec);
  for (const [a, b, c] of tris) { idx.push(a, c, b); idx.push(m * n + a, m * n + b, m * n + c); }
  return orient({ positions: new Float32Array(pos), index: new Uint32Array(idx) });
}

export function shapeMesh(s: Shape): BoxMesh {
  switch (s.kind) {
    case 'plan': {
      if (s.holes.length) throw new Error('plan shapes with holes carry their own mesh');
      return prism(sampleLoop(s.outer), 1, (k, a, b) => [a, b, k ? s.z1 : s.z0]);
    }
    case 'sweep': return prism(s.section, 1, (k, a, b) => [s.origin[0] + s.x[0] * a + s.dir[0] * s.depth * k, s.origin[1] + s.x[1] * a + s.dir[1] * s.depth * k, s.origin[2] + b]);
    case 'revolve': {
      const m = Math.max(2, Math.ceil(s.angle / (Math.PI / 48))), t0 = Math.atan2(s.x[1], s.x[0]);
      return prism(s.section, m, (k, r, z) => { const t = t0 + (s.angle * k) / m; return [s.centre[0] + r * Math.cos(t), s.centre[1] + r * Math.sin(t), s.centre[2] + z]; });
    }
    case 'box': return boxSolid(s.min, s.max);
    case 'tube': {
      const d: V3 = [s.to[0] - s.from[0], s.to[1] - s.from[1], s.to[2] - s.from[2]];
      const L = Math.hypot(...d), w: V3 = [d[0] / L, d[1] / L, d[2] / L];
      const u = normalize(cross(Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], w)), v = cross(w, u);
      const circ: V2[] = Array.from({ length: 32 }, (_, i) => [s.r * Math.cos((i / 32) * 2 * Math.PI), s.r * Math.sin((i / 32) * 2 * Math.PI)]);
      return prism(circ, 1, (k, a, b) => [0, 1, 2].map((j) => s.from[j] + u[j] * a + v[j] * b + d[j] * k) as V3);
    }
    case 'mesh': return s.mesh;
  }
}

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Merge meshes into one. */
export function mergeMeshes(ms: BoxMesh[]): BoxMesh {
  const nP = ms.reduce((a, m) => a + m.positions.length, 0), nI = ms.reduce((a, m) => a + m.index.length, 0);
  const positions = new Float32Array(nP), index = new Uint32Array(nI);
  let p = 0, i = 0;
  for (const m of ms) {
    positions.set(m.positions, p);
    for (let k = 0; k < m.index.length; k++) index[i + k] = m.index[k] + p / 3;
    p += m.positions.length; i += m.index.length;
  }
  return { positions, index };
}

// ── the model ────────────────────────────────────────────────────────────────────────────

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const tierLayer = (t: { id: string; name: string }) => `${t.id}_${slug(t.name)}`;

/** Exact plan shape of a span band: a ring with a hole, or a piece. */
function bandShape(ring: PlanRing, span: Span, d0: number, d1: number, z0: number, z1: number): Shape {
  if (span === 'ring') return { kind: 'plan', outer: ringLoop(ring, d1), holes: [ringLoop(ring, d0)], z0, z1 };
  return { kind: 'plan', outer: pieceLoop(ring, span.seg, span.u0, span.u1, d0, d1), holes: [], z0, z1 };
}
const pieceShape = (ring: PlanRing, q: Piece): Shape => bandShape(ring, { seg: q.seg, u0: q.u0, u1: q.u1 }, q.d0, q.d1, q.z0, q.z1);

const pieceArea = (ring: PlanRing, q: { seg: SegmentId; u0: number; u1: number; d0: number; d1: number }) => Math.abs(loopArea(pieceLoop(ring, q.seg, q.u0, q.u1, q.d0, q.d1))) / 1e6;

export function buildModel(s: Stadium): BimModel {
  const p = s.project, ring = s.ring, B = s.building, AR = s.architecture, SYS = s.systems, f = s.field;
  const els: BimElement[] = [];
  const aggregates: Aggregate[] = [];
  const add = (e: Omit<BimElement, 'mesh'> & { mesh?: () => BoxMesh }) => {
    const shapes = e.shapes;
    els.push({ ...e, mesh: e.mesh ?? (() => mergeMeshes(shapes.map(shapeMesh))) });
  };

  // ── field
  {
    const r = f.surface;
    add({ id: 'FIELD.SURFACE', name: 'Playing surface', layer: '01_FIELD::SURFACE', category: 'Field', ifc: { cls: 'IfcCovering', type: 'FLOORING', objectType: 'Playing surface' }, status: 'element', base: -50,
      shapes: [{ kind: 'box', min: [r.minX, r.minY, -50], max: [r.maxX, r.maxY, 0] }], props: { Sport: f.sport, FieldLength: f.length, FieldWidth: f.width } });
    for (const g of f.goals) {
      const [A, Bp] = g.posts, x = A[0], tubes: Shape[] = [{ kind: 'tube', from: [x, A[1], g.crossbarZ], to: [x, Bp[1], g.crossbarZ], r: 60 }];
      if (g.kind === 'soccer') tubes.push({ kind: 'tube', from: [A[0], A[1], 0], to: [A[0], A[1], g.crossbarZ], r: 60 }, { kind: 'tube', from: [Bp[0], Bp[1], 0], to: [Bp[0], Bp[1], g.crossbarZ], r: 60 });
      else {
        const sg = Math.sign(x) || 1;
        tubes.push({ kind: 'tube', from: [x + sg * g.depth, 0, 0], to: [x + sg * g.depth, 0, g.crossbarZ - 600], r: 110 }, { kind: 'tube', from: [x + sg * g.depth, 0, g.crossbarZ - 600], to: [x, 0, g.crossbarZ], r: 90 },
          { kind: 'tube', from: [A[0], A[1], g.crossbarZ], to: [A[0], A[1], g.postTopZ], r: 50 }, { kind: 'tube', from: [Bp[0], Bp[1], g.crossbarZ], to: [Bp[0], Bp[1], g.postTopZ], r: 50 });
      }
      add({ id: g.id, name: g.kind === 'soccer' ? 'Goal' : 'Goalpost', layer: '01_FIELD::GOALS', category: 'Field', ifc: { cls: 'IfcBuildingElementProxy', type: 'USERDEFINED', objectType: 'Goal frame (generic)' }, status: 'placeholder', base: 0, shapes: tubes, props: {} });
    }
  }

  if (f.stage) {
    const q = f.stage.rect;
    add({ id: 'FIELD.STAGE', name: 'Stage', layer: '01_FIELD::STAGE', category: 'Field', ifc: { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Performance stage' }, status: 'mass', base: 0,
      shapes: [{ kind: 'box', min: [q.minX, q.minY, 0], max: [q.maxX, q.maxY, f.stage.z] }], props: { DeckLevel: f.stage.z, Depth: Math.round(q.maxX - q.minX), Width: Math.round(q.maxY - q.minY) } });
  }

  // ── terraces: straight runs as section sweeps, corners as section revolves; vomitories cut them
  for (const t of s.profiles) {
    const club = p.tiers[t.index]?.kind === 'club';
    const layer = `02_BOWL_GEOMETRY::${tierLayer(t)}`;
    for (const seg of SEGMENTS) {
      const n = s.layout.rows[seg][t.index];
      if (n <= 0) continue;
      const ol = tierOutline(t, n) as V2[];
      let shape: Shape;
      if (!isCorner(seg)) {
        const a = pointAt(ring, seg, 0, 0), b = pointAt(ring, seg, 1, 0), len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1) continue;
        shape = { kind: 'sweep', origin: [a.x, a.y, 0], x: [a.nx, a.ny], dir: [(b.x - a.x) / len, (b.y - a.y) / len], section: ol, depth: len };
      } else {
        const s0 = pointAt(ring, seg, 0, 0);
        shape = { kind: 'revolve', centre: [s0.x - s0.nx * ring.r, s0.y - s0.ny * ring.r, 0], x: [s0.nx, s0.ny], section: ol.map(([d, z]) => [ring.r + d, z] as V2), angle: Math.PI / 2 };
      }
      add({ id: `TERRACE.${t.id}.${seg}`, name: `${t.name} terrace ${seg}`, layer, category: 'Seating terraces', ifc: { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Seating terrace' }, status: 'element', base: Math.min(...ol.map((q) => q[1])),
        shapes: [shape], props: { Tier: t.id, Segment: seg, Rows: n, RowDepth: t.rowDepth, RakeDeg: +t.rakeDeg.toFixed(2), Club: club } });
    }
  }
  for (const v of s.seats.vomitories) {
    // the opening's section (as in vomCorners) carried across its width: exact planar faces. Its front
    // and back stand 25 mm clear of the risers they would otherwise touch — in a corner a flat face
    // tangent to a revolved riser makes the boolean subtraction non-manifold in IFC kernels
    const st = pointAt(ring, v.seg, v.u, 0), tx = -st.ny, ty = st.nx, lift = 30, clear = 25;
    const section: V2[] = [[v.dFront - clear, v.zFloor - clear], [v.dBack + clear, v.zFloor - clear], [v.dBack + clear, v.zTop + lift], [v.dFront - clear, v.zMouth + lift]];
    const tid = s.profiles[v.tier].id;
    add({ id: v.id, name: `Vomitory ${v.id}`, layer: '07_VERTICAL_CIRCULATION::VOMITORIES', category: 'Vomitory openings', ifc: { cls: 'IfcOpeningElement', type: 'OPENING', objectType: 'Vomitory' }, voids: `TERRACE.${tid}.${v.seg}`, status: 'element', base: v.zFloor,
      shapes: [{ kind: 'sweep', origin: [st.x - (tx * v.width) / 2, st.y - (ty * v.width) / 2, 0], x: [st.nx, st.ny], dir: [tx, ty], section, depth: v.width }], props: { Tier: tid, Section: v.section, Width: v.width, RowsRemoved: v.rowsRemoved } });
  }

  // ── Round 03 building
  for (const l of B.levels) {
    add({ id: l.id, name: l.name, layer: l.kind === 'concourse' ? '06_CONCOURSES::FLOOR_PLATES' : '05_PREMIUM::LEVELS', category: l.kind === 'concourse' ? 'Concourse floor plates' : 'Premium floor plates', ifc: { cls: 'IfcSlab', type: 'FLOOR' }, status: 'element', base: l.z - SLAB,
      shapes: [bandShape(ring, 'ring', l.d0, l.d1, l.z - SLAB, l.z)], mesh: () => bandSolid(ring, 'ring', l.d0, l.d1, l.z - SLAB, l.z), props: { Level: Math.round(l.z), AreaM2: Math.round(l.area), Serves: l.serves } });
  }
  for (const st of B.suites) {
    const h = (p.premium.find((x) => `PREM.${x.id}` === st.level)?.height ?? 4500) - SLAB - 600;
    const q = { seg: st.seg, u0: st.u0, u1: st.u1, d0: st.d0, d1: st.d1 };
    add({ id: st.id, name: `Suite ${st.id}`, layer: '05_PREMIUM::SUITES', category: 'Suites', ifc: { cls: 'IfcSpace', type: 'INTERNAL', objectType: 'Suite' }, status: 'reservation', base: st.z,
      shapes: [bandShape(ring, q, st.d0, st.d1, st.z, st.z + h)], space: { area: pieceArea(ring, q), external: false, height: h }, props: { Seats: st.seats, Level: Math.round(st.z) } });
  }
  for (const z of B.program) {
    const q = { seg: z.seg, u0: z.u0, u1: z.u1, d0: z.d0 + 200, d1: z.d1 - 200 };
    add({ id: z.id, name: PROGRAM_LABEL[z.kind], layer: `06_CONCOURSES::PROGRAM::${slug(PROGRAM_LABEL[z.kind])}`, category: 'Concourse program', ifc: { cls: 'IfcSpace', type: 'INTERNAL', objectType: PROGRAM_LABEL[z.kind] }, status: 'reservation', base: z.z,
      shapes: [bandShape(ring, q, q.d0, q.d1, z.z, z.z + 3200)], space: { area: pieceArea(ring, q), external: false, height: 3200 }, props: { Use: PROGRAM_LABEL[z.kind], ProgramAreaM2: +z.area.toFixed(1), Level: Math.round(z.z) } });
  }
  for (const c of B.cores) {
    const q = { seg: c.seg, u0: c.u0, u1: c.u1, d0: c.d0, d1: c.d1 };
    add({ id: c.id, name: `Core ${c.id}`, layer: '07_VERTICAL_CIRCULATION::CORES', category: 'Vertical circulation cores', ifc: { cls: 'IfcSpace', type: 'INTERNAL', objectType: 'Vertical circulation core' }, status: 'reservation', base: 0,
      shapes: [bandShape(ring, q, c.d0, c.d1, 0, c.zTop)], space: { area: pieceArea(ring, q), external: false, height: c.zTop }, props: { Stairs: c.stairs, Lifts: c.lifts, Top: Math.round(c.zTop) } });
  }

  // ── Round 04 architecture
  const memberIfc = {
    raker: { cls: 'IfcBeam', type: 'USERDEFINED', objectType: 'Raker beam' }, column: { cls: 'IfcColumn', type: 'COLUMN' },
    roofFrame: { cls: 'IfcBeam', type: 'USERDEFINED', objectType: 'Primary roof frame' }, mullion: { cls: 'IfcMember', type: 'MULLION' },
  } as const;
  const memberLayer = { raker: '08_STRUCTURE::RAKERS', column: '08_STRUCTURE::COLUMNS', roofFrame: '09_ROOF::PRIMARY_FRAMES', mullion: '10_FACADE::MULLIONS' } as const;
  const memberCat = { raker: 'Structure: rakers', column: 'Structure: columns', roofFrame: 'Roof: primary frames', mullion: 'Facade: mullions / fins' } as const;
  const r = AR.roof;
  const hasRoof = r.spans.length > 0 || !!r.cap || r.boxes.length > 0 || !!AR.sphere;
  if (hasRoof) aggregates.push({ id: 'ROOF', name: `Roof (${ROOF_LABEL[r.type]})`, ifc: { cls: 'IfcRoof', type: 'USERDEFINED', objectType: ROOF_LABEL[r.type] }, layer: '09_ROOF', status: 'mass', base: Math.round(r.zTop0), props: { RoofType: r.type, Material: p.architecture.roof.material, Coverage: +AR.metrics.coverage.toFixed(3) } });
  const hasFacade = AR.facade.pieces.length > 0 || !!AR.sphere;
  if (hasFacade) aggregates.push(AR.sphere
    ? { id: 'FACADE', name: 'Exosphere', ifc: { cls: 'IfcCurtainWall', type: 'USERDEFINED', objectType: 'Spherical LED envelope (Exosphere)' }, layer: '10_FACADE', status: 'mass', base: 0, props: { WidthMm: Math.round(2 * AR.sphere.R), HeightMm: Math.round(AR.sphere.top), LedAreaM2: Math.round(AR.sphere.exoArea) } }
    : { id: 'FACADE', name: 'Facade', ifc: { cls: 'IfcCurtainWall', type: 'USERDEFINED', objectType: `Facade (${p.architecture.facade.type})` }, layer: '10_FACADE', status: 'mass', base: 0, props: { FacadeType: p.architecture.facade.type, Material: p.architecture.facade.material } });
  for (const m of AR.members) {
    const st = pointAt(ring, m.seg, m.u, 0), tx = -st.ny, ty = st.nx;
    const shape: Shape = { kind: 'sweep', origin: [st.x - (tx * m.width) / 2, st.y - (ty * m.width) / 2, 0], x: [st.nx, st.ny], dir: [tx, ty], section: m.section as V2[], depth: m.width };
    add({ id: m.id, name: m.id, layer: memberLayer[m.kind], category: memberCat[m.kind], ifc: { ...memberIfc[m.kind] }, parent: m.kind === 'roofFrame' && hasRoof ? 'ROOF' : m.kind === 'mullion' && hasFacade ? 'FACADE' : undefined,
      status: m.kind === 'mullion' ? 'mass' : 'element', base: Math.min(...m.section.map((q) => q[1])), shapes: [shape], props: { Grid: m.frame ?? '', Width: Math.round(m.width) } });
  }
  {
    const sk = roofSkin(ring, r);
    sk.deck.forEach((mesh, i) => add({ id: `ROOF.DECK${sk.deck.length > 1 ? `.${i + 1}` : ''}`, name: 'Roof deck', layer: '09_ROOF::DECK', category: 'Roof: deck', ifc: { cls: 'IfcSlab', type: 'ROOF' }, parent: 'ROOF', status: 'mass', base: minZ(mesh), shapes: [{ kind: 'mesh', mesh }], props: { Material: p.architecture.roof.material } }));
    if (r.cap) { const mesh = capSolid(ring, r.dIn, r.cap.z, r.cap.rise); add({ id: 'ROOF.CAP', name: 'Roof cap', layer: '09_ROOF::CAP', category: 'Roof: cap', ifc: { cls: 'IfcSlab', type: 'ROOF', objectType: 'Roof cap' }, parent: 'ROOF', status: 'mass', base: minZ(mesh), shapes: [{ kind: 'mesh', mesh }], props: { Rise: Math.round(r.cap.rise) } }); }
    for (const b of r.boxes) add({ id: b.id, name: b.kind === 'truss' ? 'Roof truss' : 'Roof panel', layer: b.kind === 'truss' ? '09_ROOF::TRUSSES' : '09_ROOF::PANELS', category: b.kind === 'truss' ? 'Roof: trusses' : 'Roof: panels',
      ifc: b.kind === 'truss' ? { cls: 'IfcMember', type: 'CHORD', objectType: 'Long-span truss (envelope)' } : { cls: 'IfcPlate', type: 'USERDEFINED', objectType: 'Retractable roof panel' }, parent: 'ROOF', status: 'mass', base: b.min[2], shapes: [{ kind: 'box', min: b.min, max: b.max }], props: { Depth: Math.round(b.max[2] - b.min[2]) } });
  }
  for (const e of sphereElements(s)) add(e);
  for (const q of AR.facade.pieces) add({ id: q.id, name: 'Facade skin', layer: '10_FACADE::SKIN', category: 'Facade: skin', ifc: { cls: 'IfcPlate', type: 'CURTAIN_PANEL' }, parent: 'FACADE', status: 'mass', base: q.z0, shapes: [pieceShape(ring, q)], mesh: () => pieceSolid(ring, q), props: { Height: Math.round(q.z1 - q.z0) } });
  for (const q of AR.facade.bands) add({ id: q.id, name: 'Facade band', layer: '10_FACADE::BANDS', category: 'Facade: bands', ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: 'Facade band' }, parent: 'FACADE', status: 'mass', base: q.z0, shapes: [pieceShape(ring, q)], mesh: () => pieceSolid(ring, q), props: {} });
  for (const q of AR.facade.canopies) add({ id: q.id, name: 'Entrance canopy', layer: '10_FACADE::PORTALS', category: 'Facade: portal canopies', ifc: { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Entrance canopy' }, status: 'mass', base: q.z0, shapes: [pieceShape(ring, q)], mesh: () => pieceSolid(ring, q), props: { ClearHeight: Math.round(q.z0) } });
  for (const z of AR.boh.zones) {
    const q = { seg: z.seg, u0: z.u0, u1: z.u1, d0: z.d0 + 250, d1: z.d1 - 250 };
    add({ id: z.id, name: BOH_LABEL[z.kind], layer: `16_BACK_OF_HOUSE::${slug(BOH_LABEL[z.kind])}`, category: 'Back of house: rooms', ifc: { cls: 'IfcSpace', type: 'INTERNAL', objectType: BOH_LABEL[z.kind] }, status: 'reservation', base: z.z0,
      shapes: [bandShape(ring, q, q.d0, q.d1, z.z0, z.z1 - 400)], space: { area: pieceArea(ring, q), external: false, height: z.z1 - 400 - z.z0 }, props: { Use: BOH_LABEL[z.kind], ProgramAreaM2: +z.area.toFixed(1) } });
  }
  const cor = AR.boh.corridor;
  if (cor) add({ id: 'BOH.SERVICE_CORRIDOR', name: 'Service corridor slab', layer: '16_BACK_OF_HOUSE::SERVICE_CORRIDOR', category: 'Back of house: service corridor slab', ifc: { cls: 'IfcSlab', type: 'FLOOR', objectType: 'Service corridor' }, status: 'element', base: -SLAB,
    shapes: [bandShape(ring, 'ring', cor.d0, cor.d1, -SLAB, 0)], mesh: () => bandSolid(ring, 'ring', cor.d0, cor.d1, -SLAB, 0), props: { Width: Math.round(cor.d1 - cor.d0) } });

  // ── Round 05 systems
  const external = new Set(['substation', 'generators', 'yard', 'compound']);
  const zoneIfc = (kind: string, label: string): { ifc: BimElement['ifc']; status: ModelStatus } => {
    switch (kind) {
      case 'riser': return { ifc: { cls: 'IfcBuildingElementProxy', type: 'PROVISIONFORSPACE', objectType: label }, status: 'reservation' };
      case 'mast': return { ifc: { cls: 'IfcColumn', type: 'USERDEFINED', objectType: 'Floodlight mast' }, status: 'mass' };
      case 'head': return { ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: 'Mast head frame' }, status: 'mass' };
      case 'board': case 'ribbon': return { ifc: { cls: 'IfcAudioVisualAppliance', type: 'DISPLAY', objectType: label }, status: 'placeholder' };
      case 'boardFrame': return { ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: label }, status: 'mass' };
      case 'speaker': return { ifc: { cls: 'IfcAudioVisualAppliance', type: 'SPEAKER', objectType: label }, status: 'placeholder' };
      case 'camera': return { ifc: { cls: 'IfcAudioVisualAppliance', type: 'CAMERA', objectType: label }, status: 'placeholder' };
      default: return { ifc: { cls: 'IfcSpace', type: external.has(kind) ? 'EXTERNAL' : 'INTERNAL', objectType: label }, status: 'reservation' };
    }
  };
  const sysLayer: Record<string, string> = {
    plant: '11_HVAC::CENTRAL_PLANT', ahu: '11_HVAC::AIR_HANDLING', switchgear: '12_ELECTRICAL::SWITCHGEAR', substation: '12_ELECTRICAL::TRANSFORMERS',
    generators: '12_ELECTRICAL::GENERATORS', elecRoom: '12_ELECTRICAL::ROOMS', water: '13_PLUMBING::WATER_STORAGE', mast: '14_LIGHTING::MASTS', head: '14_LIGHTING::MASTS',
    board: '15_AV_IT::VIDEO_BOARDS', boardFrame: '15_AV_IT::VIDEO_BOARDS', ribbon: '15_AV_IT::RIBBON_BOARDS', speaker: '15_AV_IT::SPEAKERS', telecom: '15_AV_IT::TELECOM',
    camera: '15_AV_IT::BROADCAST::CAMERAS', tribune: '15_AV_IT::BROADCAST::TRIBUNE', compound: '15_AV_IT::BROADCAST::COMPOUND', yard: '17_SITE::SERVICE_YARD', fieldAccess: '17_SITE::FIELD_ACCESS',
  };
  const riserLayer: Record<string, string> = { hvac: '11_HVAC::RISERS', electrical: '12_ELECTRICAL::RISERS', plumbing: '13_PLUMBING::RISERS' };
  const sysCat = (system: string) => `Systems: ${system === 'avit' ? 'AV / IT' : system === 'hvac' ? 'HVAC' : system[0].toUpperCase() + system.slice(1)}`;
  for (const z of SYS.zones) {
    const layer = z.kind === 'riser' ? riserLayer[z.system] : sysLayer[z.kind];
    if (!layer) continue;
    const { ifc, status } = zoneIfc(z.kind, z.label);
    const cam = z.kind === 'camera' ? SYS.cameras.find((c) => `BRD.${c.id}` === z.id) : undefined;
    add({ id: z.id, name: z.label, layer, category: sysCat(z.system), ifc, status, base: z.z0, shapes: [pieceShape(ring, z)], mesh: () => pieceSolid(ring, z),
      space: ifc.cls === 'IfcSpace' ? { area: pieceArea(ring, z), external: external.has(z.kind), height: z.z1 - z.z0 } : undefined,
      props: { System: z.system, Use: z.label, ...(z.area ? { AreaM2: +z.area.toFixed(1) } : {}), ...(cam ? { Eye: cam.eye.map(Math.round).join(','), Target: cam.target.map(Math.round).join(','), DepressionDeg: +cam.depression.toFixed(1) } : {}) } });
  }
  const bandIfc: Record<string, { ifc: BimElement['ifc']; layer: string; status: ModelStatus }> = {
    duct: { ifc: { cls: 'IfcBuildingElementProxy', type: 'PROVISIONFORSPACE', objectType: 'Duct distribution zone' }, layer: '11_HVAC::DUCT_ZONES', status: 'reservation' },
    tray: { ifc: { cls: 'IfcBuildingElementProxy', type: 'PROVISIONFORSPACE', objectType: 'Cable tray zone' }, layer: '12_ELECTRICAL::CABLE_TRAYS', status: 'reservation' },
    catwalk: { ifc: { cls: 'IfcSlab', type: 'USERDEFINED', objectType: 'Lighting catwalk' }, layer: '14_LIGHTING::CATWALK', status: 'mass' },
  };
  for (const b of SYS.bands) {
    const m = bandIfc[b.kind];
    if (!m) continue;
    add({ id: b.id, name: b.label, layer: m.layer, category: sysCat(b.system), ifc: m.ifc, status: m.status, base: b.z0, shapes: [bandShape(ring, b.span, b.d0, b.d1, b.z0, b.z1)], mesh: () => bandSolid(ring, b.span, b.d0, b.d1, b.z0, b.z1), props: { System: b.system, Use: b.label, Depth: Math.round(b.z1 - b.z0) } });
  }
  for (const b of SYS.boxes) add({ id: b.id, name: b.label, layer: b.kind === 'speaker' ? '15_AV_IT::SPEAKERS' : '15_AV_IT::VIDEO_BOARDS', category: sysCat(b.system), ifc: { cls: 'IfcAudioVisualAppliance', type: b.kind === 'speaker' ? 'SPEAKER' : 'DISPLAY', objectType: b.label }, status: 'placeholder', base: b.min[2], shapes: [{ kind: 'box', min: b.min, max: b.max }], props: { Underside: Math.round(b.min[2]) } });

  // ── storeys: field level and every distinct building level
  const storeys: Storey[] = [{ id: 'L00', name: 'Field level', elevation: 0 }];
  const byZ = new Map<number, string[]>();
  for (const l of B.levels) { const z = Math.round(l.z); if (z <= 0) continue; byZ.set(z, [...(byZ.get(z) ?? []), l.name]); }
  [...byZ.keys()].sort((a, b) => a - b).forEach((z, i) => storeys.push({ id: `L${String(i + 1).padStart(2, '0')}`, name: [...new Set(byZ.get(z))].join(' / '), elevation: z }));

  return { elements: els, aggregates, storeys };
}

/**
 * The spherical envelope's elements (roof type 'sphere'): the structural dome with its 32 trusses and
 * rings, the Exosphere's diagrid zone and LED skin, and the interior LED media plane. Shared by the
 * element model and the Rhino export. Revolved shells are written as two half revolves.
 */
export function sphereElements(s: Stadium): (Omit<BimElement, 'mesh'> & { mesh?: () => BoxMesh })[] {
  const sp = s.architecture.sphere;
  if (!sp) return [];
  const c: V3 = [sp.cx, sp.cy, 0];
  const halves = (section: V2[]): Shape[] => [{ kind: 'revolve', centre: c, x: [1, 0], section, angle: Math.PI }, { kind: 'revolve', centre: c, x: [-1, 0], section, angle: Math.PI }];
  const out: (Omit<BimElement, 'mesh'> & { mesh?: () => BoxMesh })[] = [];
  const ro = sp.capR + SPHERE.domeGap;
  const crownZ = sp.capZ + Math.sqrt(ro * ro - sp.crownR ** 2);
  out.push({ id: 'ROOF.DOME', name: 'Dome shell', layer: '09_ROOF::DOME', category: 'Roof: dome', ifc: { cls: 'IfcRoof', type: 'DOME_ROOF', objectType: 'Steel-framed concrete dome' }, parent: 'ROOF', status: 'mass', base: Math.round(sp.springZ),
    shapes: halves(domeSection(sp) as V2[]), props: { SpringLevel: Math.round(sp.springZ), Apex: Math.round(crownZ), AreaM2: Math.round(sp.domeArea), Thickness: SPHERE.shell } });
  sphereRibs(sp).forEach((pts, k) => out.push({ id: `ROOF.TRUSS.${String(k + 1).padStart(2, '0')}`, name: 'Radial dome truss', layer: '09_ROOF::TRUSSES', category: 'Roof: trusses', ifc: { cls: 'IfcMember', type: 'CHORD', objectType: 'Radial dome truss' }, parent: 'ROOF', status: 'mass', base: Math.round(pts[0][2]),
    shapes: pts.slice(1).map((q, i) => ({ kind: 'tube', from: pts[i], to: q, r: 700 }) as Shape), props: { Depth: SPHERE.ribDepth } }));
  const ring = (r0: number, r1: number, z0: number, z1: number): V2[] => [[r0, z0], [r1, z0], [r1, z1], [r0, z1]];
  out.push({ id: 'ROOF.COMPRESSION_RING', name: 'Compression ring', layer: '09_ROOF::RINGS', category: 'Roof: rings', ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: 'Dome compression ring' }, parent: 'ROOF', status: 'mass', base: Math.round(crownZ),
    shapes: halves(ring(sp.crownR - 1000, sp.crownR + 1000, crownZ, crownZ + 2000)), props: { Radius: Math.round(sp.crownR) } });
  out.push({ id: 'ROOF.TENSION_RING', name: 'Tension ring (concourse roof)', layer: '09_ROOF::RINGS', category: 'Roof: rings', ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: 'Dome tension ring' }, parent: 'ROOF', status: 'mass', base: Math.round(sp.springZ - 2000),
    shapes: halves(ring(sp.a, sp.a + SPHERE.domeGap + SPHERE.shell + 2500, sp.springZ - 2000, sp.springZ)), props: { Radius: Math.round(sp.a) } });
  out.push({ id: 'FACADE.EXOSPHERE.DIAGRID', name: 'Exosphere diagrid', layer: '10_FACADE::DIAGRID', category: 'Facade: Exosphere diagrid', ifc: { cls: 'IfcMember', type: 'USERDEFINED', objectType: 'Steel diagrid shell zone' }, parent: 'FACADE', status: 'mass', base: 0,
    shapes: halves(exoSection(sp) as V2[]), props: { Radius: Math.round(sp.R), Depth: SPHERE.exoDepth } });
  out.push({ id: 'FACADE.EXOSPHERE.LED', name: 'Exosphere LED skin', layer: '18_LED::EXOSPHERE', category: 'LED: Exosphere', ifc: { cls: 'IfcAudioVisualAppliance', type: 'DISPLAY', objectType: 'LED puck skin (generic)' }, parent: 'FACADE', status: 'placeholder', base: 0,
    shapes: halves(shellSection(sp.R, 100, sp.zc, Math.asin(-sp.zc / sp.R), Math.acos(1500 / sp.R), 48) as V2[]), props: { AreaM2: Math.round(sp.exoArea), Pucks: sp.pucks, PuckPitch: SPHERE.puckPitch } });
  const screen = screenSolid(sp);
  out.push({ id: 'LED.MEDIA_PLANE', name: 'LED media plane', layer: '18_LED::MEDIA_PLANE', category: 'LED: media plane', ifc: { cls: 'IfcAudioVisualAppliance', type: 'DISPLAY', objectType: 'Interior LED media plane (generic)' }, status: 'placeholder', base: 0,
    shapes: [{ kind: 'mesh', mesh: screen }], props: { AreaM2: Math.round(sp.screenArea), Apex: Math.round(sp.apex) } });
  return out;
}

function minZ(m: BoxMesh) { let z = Infinity; for (let k = 2; k < m.positions.length; k += 3) z = Math.min(z, m.positions[k]); return z; }

/** The storey an element at `base` belongs to: the highest at or below it (the field level for anything lower). */
export function storeyOf(storeys: Storey[], base: number): Storey {
  let s = storeys[0];
  for (const t of storeys) if (t.elevation <= base + 1) s = t;
  return s;
}
