/**
 * Sport field systems. The sport sets the playing field, its markings and the sightline focus;
 * everything else in the stadium is generated around it.
 *
 * Local frame (see core/coords.ts): origin at the centre of the playing field at field level,
 * +X along the field length, +Y across it, +Z up, millimetres.
 *
 * Every dimension here traces to a rule in core/data/standards.ts (ids in `sources`).
 */
import type { Mm } from '../units';
import { ft, m } from '../units';

export type SportId = 'soccer' | 'nfl' | 'stage';
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type Marking =
  /** straight painted line; a→b is the centreline of the paint, `width` its full width */
  | { kind: 'line'; id: string; a: Vec2; b: Vec2; width: Mm }
  /** circular arc, angles in radians CCW from +X; full circle when a1 - a0 = 2π */
  | { kind: 'arc'; id: string; c: Vec2; r: Mm; a0: number; a1: number; width: Mm }
  /** filled spot */
  | { kind: 'spot'; id: string; c: Vec2; r: Mm };

export interface Rect { minX: Mm; maxX: Mm; minY: Mm; maxY: Mm }

export interface FieldZone { id: string; label: string; kind: 'endzone' | 'border' | 'team' | 'runoff' | 'stage'; rect: Rect }
export interface GoalFrame { id: string; /** inner post faces (soccer) / upright centres (NFL), field level */ posts: [Vec2, Vec2]; crossbarZ: Mm; postTopZ: Mm; depth: Mm; kind: 'soccer' | 'nfl' }
export interface NumberLabel { text: string; at: Vec2; height: Mm; rotation: number }

export interface FieldParams { length: Mm; width: Mm; runoffSide: Mm; runoffEnd: Mm }

export interface FieldModel {
  sport: SportId;
  length: Mm; width: Mm;
  /** the playing field boundary (soccer: outer edge of touch/goal lines; NFL: sidelines/end lines) */
  boundary: Rect;
  /** finished playing surface, playing field + run-off */
  surface: Rect;
  markings: Marking[];
  zones: FieldZone[];
  goals: GoalFrame[];
  numbers: NumberLabel[];
  /** a raised performance stage beyond the east end of the floor (event venues), deck level `z` */
  stage: { rect: Rect; z: Mm } | null;
  /** named local landmarks in mm — the documented points other systems attach to */
  landmarks: Record<string, Vec3>;
  /** sightline point of focus: the field boundary at field level, inset by `focusInset` */
  lineColor: string;
  sources: string[];
}

export interface SportDef {
  id: SportId;
  label: string;
  /** dimensional limits the UI allows for this sport (from its governing rules) */
  limits: { length: [Mm, Mm]; width: [Mm, Mm]; fixed: boolean };
  defaults: FieldParams & { sideDistance: Mm; endDistance: Mm };
  build: (p: FieldParams) => FieldModel;
  focusLabel: string;
}

const half = (L: Mm, W: Mm): Rect => ({ minX: -L / 2, maxX: L / 2, minY: -W / 2, maxY: W / 2 });

// ── association football (IFAB Laws of the Game, Law 1) ─────────────────────────────
const LINE_SOCCER = 120; // Law 1: lines no wider than 12 cm, all the same width

function buildSoccer(p: FieldParams): FieldModel {
  const L = p.length, W = p.width, w = LINE_SOCCER, h = w / 2;
  const X = L / 2 - h, Y = W / 2 - h; // paint centrelines, lines lie inside the boundary
  const mk: Marking[] = [];
  const line = (id: string, a: Vec2, b: Vec2) => mk.push({ kind: 'line', id, a, b, width: w });
  line('TOUCHLINE_N', [-X - h, Y], [X + h, Y]);
  line('TOUCHLINE_S', [-X - h, -Y], [X + h, -Y]);
  line('GOALLINE_E', [X, -Y], [X, Y]);
  line('GOALLINE_W', [-X, -Y], [-X, Y]);
  line('HALFWAY', [0, -Y], [0, Y]);
  mk.push({ kind: 'arc', id: 'CENTRE_CIRCLE', c: [0, 0], r: 9150 - h, a0: 0, a1: Math.PI * 2, width: w });
  mk.push({ kind: 'spot', id: 'CENTRE_MARK', c: [0, 0], r: 110 });
  for (const [s, end] of [[1, 'E'], [-1, 'W']] as const) {
    // goal 7.32 m between inner post faces; areas measured from the inside of the posts
    const pa = 16500 + 3660; // penalty area half-width: 16.5 m beyond each post
    const ga = 5500 + 3660;
    const gx = s * (L / 2);
    line(`PENALTY_${end}_FRONT`, [gx - s * (16500 - h), -pa + h], [gx - s * (16500 - h), pa - h]);
    line(`PENALTY_${end}_N`, [gx, pa - h], [gx - s * (16500 - h), pa - h]);
    line(`PENALTY_${end}_S`, [gx, -pa + h], [gx - s * (16500 - h), -pa + h]);
    line(`GOALAREA_${end}_FRONT`, [gx - s * (5500 - h), -ga + h], [gx - s * (5500 - h), ga - h]);
    line(`GOALAREA_${end}_N`, [gx, ga - h], [gx - s * (5500 - h), ga - h]);
    line(`GOALAREA_${end}_S`, [gx, -ga + h], [gx - s * (5500 - h), -ga + h]);
    const spot: Vec2 = [gx - s * 11000, 0];
    mk.push({ kind: 'spot', id: `PENALTY_MARK_${end}`, c: spot, r: 110 });
    // penalty arc: the part of the 9.15 m circle round the penalty mark that lies outside the area
    const dx = 16500 - 11000;
    const t = Math.acos(dx / 9150);
    const a0 = s > 0 ? Math.PI - t : -t, a1 = s > 0 ? Math.PI + t : t;
    mk.push({ kind: 'arc', id: `PENALTY_ARC_${end}`, c: spot, r: 9150 - h, a0, a1, width: w });
    for (const [sy, side] of [[1, 'N'], [-1, 'S']] as const) {
      // corner arcs, 1 m radius, inside the field
      const c: Vec2 = [s * (L / 2), sy * (W / 2)];
      const start = s > 0 ? (sy > 0 ? Math.PI : Math.PI / 2) : (sy > 0 ? -Math.PI / 2 : 0);
      mk.push({ kind: 'arc', id: `CORNER_${end}${side}`, c, r: 1000 - h, a0: start, a1: start + Math.PI / 2, width: w });
    }
  }
  const surface: Rect = { minX: -L / 2 - p.runoffEnd, maxX: L / 2 + p.runoffEnd, minY: -W / 2 - p.runoffSide, maxY: W / 2 + p.runoffSide };
  return {
    sport: 'soccer', length: L, width: W, boundary: half(L, W), surface, markings: mk,
    zones: [{ id: 'RUNOFF', label: 'Run-off', kind: 'runoff', rect: surface }],
    goals: [1, -1].map((s) => ({ id: s > 0 ? 'GOAL_E' : 'GOAL_W', kind: 'soccer' as const, posts: [[s * L / 2, -3660], [s * L / 2, 3660]] as [Vec2, Vec2], crossbarZ: 2440, postTopZ: 2440, depth: 2000 })),
    numbers: [],
    stage: null,
    landmarks: {
      CENTRE_MARK: [0, 0, 0],
      PENALTY_MARK_E: [L / 2 - 11000, 0, 0], PENALTY_MARK_W: [-L / 2 + 11000, 0, 0],
      GOAL_CENTRE_E: [L / 2, 0, 0], GOAL_CENTRE_W: [-L / 2, 0, 0],
      CORNER_NE: [L / 2, W / 2, 0], CORNER_NW: [-L / 2, W / 2, 0], CORNER_SE: [L / 2, -W / 2, 0], CORNER_SW: [-L / 2, -W / 2, 0],
    },
    lineColor: '#ffffff',
    sources: ['ifab.law1.dimensions', 'ifab.law1.markings', 'fifa.pitch.105x68', 'fifa.runoff.min'],
  };
}

// ── American football (NFL Rulebook, Rule 1) ─────────────────────────────────────────
const YD = ft(3);
const LINE_NFL = 4 * 25.4; // 4″
const GOAL_LINE_NFL = 8 * 25.4; // 8″ goal lines
const BORDER = ft(6); // solid white border, minimum 6 ft, outside the sidelines and end lines
const HASH_FROM_SIDELINE = ft(70, 9);

function buildNfl(p: FieldParams): FieldModel {
  const L = ft(360), W = ft(160); // fixed by rule, incl. both 10-yd end zones
  const X = L / 2, Y = W / 2, G = X - 10 * YD;
  const mk: Marking[] = [];
  const line = (id: string, a: Vec2, b: Vec2, width = LINE_NFL) => mk.push({ kind: 'line', id, a, b, width });
  // sidelines and end lines are inside the 6' border; paint the inner edge as a 4" line
  for (let k = 0; k <= 20; k++) {
    const x = -G + k * 5 * YD;
    const isGoal = k === 0 || k === 20;
    line(isGoal ? `GOALLINE_${k === 0 ? 'W' : 'E'}` : `YARD_${k * 5 <= 50 ? k * 5 : 100 - k * 5}_${k < 10 ? 'W' : k > 10 ? 'E' : 'C'}`, [x, -Y], [x, Y], isGoal ? GOAL_LINE_NFL : LINE_NFL);
  }
  // one-yard marks: 2' hash marks on both inbounds lines, and short marks along each sideline
  const hy = Y - HASH_FROM_SIDELINE;
  for (let k = 1; k < 100; k++) {
    if (k % 5 === 0) continue;
    const x = -G + k * YD;
    line(`HASH_N_${k}`, [x, hy], [x, hy + ft(2)]);
    line(`HASH_S_${k}`, [x, -hy], [x, -hy - ft(2)]);
    line(`SIDE_N_${k}`, [x, Y - 4 * 25.4], [x, Y - 4 * 25.4 - ft(2)]);
    line(`SIDE_S_${k}`, [x, -Y + 4 * 25.4], [x, -Y + 4 * 25.4 + ft(2)]);
  }
  // try lines: 1 yd long at the 2-yard line
  line('TRY_E', [G - 2 * YD, -YD / 2], [G - 2 * YD, YD / 2]);
  line('TRY_W', [-G + 2 * YD, -YD / 2], [-G + 2 * YD, YD / 2]);
  const numbers: NumberLabel[] = [];
  // multiples of 10, bottoms 12 yd in from each sideline, 2 yd tall
  for (let k = 1; k <= 9; k++) {
    const yard = k <= 5 ? k * 10 : 100 - k * 10;
    const x = -G + k * 10 * YD;
    numbers.push({ text: String(yard), at: [x, -Y + 12 * YD + YD], height: 2 * YD, rotation: 0 });
    numbers.push({ text: String(yard), at: [x, Y - 12 * YD - YD], height: 2 * YD, rotation: Math.PI });
  }
  const outer: Rect = { minX: -X - BORDER, maxX: X + BORDER, minY: -Y - BORDER, maxY: Y + BORDER };
  const surface: Rect = { minX: -X - Math.max(BORDER, p.runoffEnd), maxX: X + Math.max(BORDER, p.runoffEnd), minY: -Y - Math.max(BORDER, p.runoffSide), maxY: Y + Math.max(BORDER, p.runoffSide) };
  const team = (s: 1 | -1): FieldZone => ({
    id: s > 0 ? 'TEAM_AREA_N' : 'TEAM_AREA_S', label: 'Team area', kind: 'team',
    // between the 32-yard lines, from the border back to the 30' bench line (assumption, see standards registry)
    rect: { minX: -18 * YD, maxX: 18 * YD, minY: s > 0 ? Y + BORDER : -Y - ft(30), maxY: s > 0 ? Y + ft(30) : -Y - BORDER },
  });
  return {
    sport: 'nfl', length: L, width: W, boundary: half(L, W), surface, markings: mk,
    zones: [
      { id: 'ENDZONE_E', label: 'End zone', kind: 'endzone', rect: { minX: G, maxX: X, minY: -Y, maxY: Y } },
      { id: 'ENDZONE_W', label: 'End zone', kind: 'endzone', rect: { minX: -X, maxX: -G, minY: -Y, maxY: Y } },
      { id: 'BORDER', label: 'White border', kind: 'border', rect: outer },
      team(1), team(-1),
    ],
    goals: [1, -1].map((s) => ({ id: s > 0 ? 'GOALPOST_E' : 'GOALPOST_W', kind: 'nfl' as const, posts: [[s * X, -ft(9, 3)], [s * X, ft(9, 3)]] as [Vec2, Vec2], crossbarZ: ft(10), postTopZ: ft(45), depth: ft(6) })),
    numbers,
    stage: null,
    landmarks: {
      MIDFIELD: [0, 0, 0],
      GOAL_LINE_E: [G, 0, 0], GOAL_LINE_W: [-G, 0, 0],
      END_LINE_E: [X, 0, 0], END_LINE_W: [-X, 0, 0],
      CORNER_NE: [X, Y, 0], CORNER_NW: [-X, Y, 0], CORNER_SE: [X, -Y, 0], CORNER_SW: [-X, -Y, 0],
    },
    lineColor: '#ffffff',
    sources: ['nfl.rule1.field', 'nfl.rule1.border', 'nfl.rule1.lines', 'nfl.rule1.hash', 'nfl.rule1.goalposts', 'nfl.rule1.benches', 'manica.nfl.teamarea'],
  };
}

// ── event floor and stage (concert halls and immersive venues) ───────────────────────────────
/** stage depth beyond the east edge of the floor, and its deck height (Manica planning assumptions) */
export const STAGE_DEPTH = m(16);
export const STAGE_DECK = 1500;

function buildStage(p: FieldParams): FieldModel {
  const L = p.length, W = p.width;
  const boundary = half(L, W);
  const surface: Rect = { minX: -L / 2 - p.runoffEnd, maxX: L / 2 + p.runoffEnd, minY: -W / 2 - p.runoffSide, maxY: W / 2 + p.runoffSide };
  // the stage spans the floor and its side margins, from the east edge of the floor back STAGE_DEPTH
  const stage = { rect: { minX: L / 2, maxX: L / 2 + STAGE_DEPTH, minY: surface.minY, maxY: surface.maxY }, z: STAGE_DECK };
  const w = 100, mk: Marking[] = [
    { kind: 'line', id: 'FLOOR_EDGE_W', a: [-L / 2, -W / 2], b: [-L / 2, W / 2], width: w },
    { kind: 'line', id: 'FLOOR_EDGE_N', a: [-L / 2, W / 2], b: [L / 2, W / 2], width: w },
    { kind: 'line', id: 'FLOOR_EDGE_S', a: [-L / 2, -W / 2], b: [L / 2, -W / 2], width: w },
    { kind: 'line', id: 'STAGE_LIP', a: [L / 2, surface.minY], b: [L / 2, surface.maxY], width: w },
  ];
  return {
    sport: 'stage', length: L, width: W, boundary, surface, markings: mk,
    zones: [{ id: 'STAGE', label: 'Stage', kind: 'stage', rect: stage.rect }],
    goals: [], numbers: [], stage,
    landmarks: { FLOOR_CENTRE: [0, 0, 0], STAGE_LIP: [L / 2, 0, 0], STAGE_CENTRE: [L / 2 + STAGE_DEPTH / 2, 0, STAGE_DECK] },
    lineColor: '#d8d8dc',
    sources: ['manica.stage'],
  };
}

export const SPORTS: Record<SportId, SportDef> = {
  soccer: {
    id: 'soccer', label: 'Football · Soccer',
    // Law 1, international matches: 100–110 m × 64–75 m
    limits: { length: [m(100), m(110)], width: [m(64), m(75)], fixed: false },
    defaults: { length: m(105), width: m(68), runoffSide: m(6), runoffEnd: m(7.5), sideDistance: m(8), endDistance: m(10) },
    build: buildSoccer,
    focusLabel: 'nearest touchline / goal line, at pitch level',
  },
  nfl: {
    id: 'nfl', label: 'American Football · NFL',
    limits: { length: [ft(360), ft(360)], width: [ft(160), ft(160)], fixed: true },
    defaults: { length: ft(360), width: ft(160), runoffSide: ft(30) + ft(6), runoffEnd: ft(15), sideDistance: m(16), endDistance: m(12) },
    build: buildNfl,
    focusLabel: 'nearest sideline / end line, at field level',
  },
  stage: {
    id: 'stage', label: 'Event floor · Stage',
    limits: { length: [m(20), m(80)], width: [m(20), m(80)], fixed: false },
    defaults: { length: m(36), width: m(36), runoffSide: m(2), runoffEnd: m(2), sideDistance: m(3), endDistance: m(3) },
    build: buildStage,
    focusLabel: 'nearest edge of the event floor, at floor level',
  },
};
