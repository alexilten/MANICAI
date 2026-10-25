/**
 * The MANICAI project: the one authoritative, versioned description of design intent.
 * Everything visible (meshes, metrics, exports) is derived from it by the engine; nothing
 * derived is ever stored here.
 *
 * Coordinates & units (core/coords.ts): millimetres, local stadium frame with the origin at
 * the centre of the playing field at field level, +X field length, +Y field width, +Z up.
 * Site placement (north, geolocation) is held separately in `site` and never moves geometry.
 */
import { SPORTS, type SportId } from './sports';
import type { DisplayUnits, Mm } from './units';

export const SCHEMA_ID = 'manicai.project';
export const SCHEMA_VERSION = 3;

export type SightlineMode = 'cvalue' | 'riser';
export type TierKind = 'general' | 'club';
export type StandId = 'N' | 'S' | 'E' | 'W';
export type CornerId = 'NE' | 'NW' | 'SW' | 'SE';

/** Per-region overrides (Round 02). Anything left out follows the bowl-wide value. */
export interface StandParams {
  /** first-row distance from this stand's field line (sidelines N/S, ends E/W only) */
  distance?: Mm;
  /** no seating in this region (an open end, a gap for a stage or a scoreboard) */
  open?: boolean;
  /** rows per tier, keyed by tier id; a missing tier keeps its own row count (corners: the smaller of the two neighbours) */
  rows?: Record<string, number>;
}

export interface VomitoryParams {
  enabled: boolean;
  /** a vomitory in every n-th section of the tier (1 = every section) */
  every: number;
  /** the first row it removes, counted from the front of the tier (1-based) */
  mouthRow: number;
  /** clear opening width across the row, including the side walls */
  width: Mm;
}

export interface AccessibleParams {
  /** wheelchair positions (each with a companion seat) per section */
  perSection: number;
  /** platform row, 1-based from the front; 0 = the tier's last row */
  row: number;
}

/**
 * A premium level inserted under a tier (Round 03): suites or a club lounge level with its own
 * floor-to-floor height. It lifts the tier above by that height, so premium levels change the bowl
 * section (and the upper tier's sightlines) rather than being drawn on top of it.
 */
export interface PremiumLevel {
  id: string;
  name: string;
  /** the tier this level sits under (it is inserted in that tier's gap above the tier below) */
  belowTier: string;
  kind: 'suites' | 'club';
  /** floor-to-floor height added to the section */
  height: Mm;
  /** how far the level pushes the tier above back from the field (a lifted tier needs it to keep its C-values) */
  setback: Mm;
  /** stands that get suite fronts; the rest of the level is premium circulation and lounge */
  stands: StandId[];
  /** suite module: width along the bowl and depth behind the glass */
  unitWidth: Mm; unitDepth: Mm;
  /** seats per suite, including its balcony seats */
  seatsPerUnit: number;
}

/** Concourse, program and core planning allowances (Round 03). Every value is a user-editable assumption. */
export interface BuildingParams {
  /** clear circulation width of each concourse */
  concourseWidth: Mm;
  /** depth of the program zone (concessions, toilets, retail) behind each concourse */
  programDepth: Mm;
  /** clear height wanted between a concourse floor and the structure above */
  concourseClear: Mm;
  /** gross program area per spectator served, m² (MANICAI planning assumptions, not standards) */
  allowances: { concessions: number; restrooms: number; retail: number; firstAid: number; clubLounge: number };
  cores: { spacing: Mm; width: Mm; depth: Mm; stairs: number; stairWidth: Mm; lifts: number };
}

export interface TierParams {
  id: string;
  name: string;
  rows: number;
  /** tread / row depth, nosing to nosing */
  rowDepth: Mm;
  /** riser per row when sightlines.mode = 'riser' (constant rake) */
  riser: Mm;
  /** tier 1: tread level of the first row above the field. Upper tiers: vertical gap from the
   *  top tread of the tier below to this tier's first tread (holds concourse / premium levels) */
  elevation: Mm;
  /** upper tiers: how far the first row sits in front of (−) the back of the tier below; 0 = stacked flush */
  overhang: Mm;
  /** front-of-tier barrier above the first tread, for the first-row sightline check */
  barrier: Mm;
  /** C-value target for this tier (upper tiers usually accept less than the lower bowl); default: sightlines.targetC */
  targetC?: Mm;
  /** general admission or club (premium) seating */
  kind: TierKind;
  /** seat width for this tier; default: seating.seatWidth */
  seatWidth?: Mm;
  /** lateral cross-aisles: one after each listed row (1-based), seating.crossAisleWidth wide */
  crossAisles: number[];
  vomitories: VomitoryParams;
  accessible: AccessibleParams;
}

export interface Project {
  schema: typeof SCHEMA_ID;
  version: number;
  name: string;
  units: DisplayUnits;
  presetId?: string;
  site: {
    /** compass bearing of the local +X axis, degrees clockwise from true north.
     *  Default 90: +X points east, so the local "north sideline" (+Y) faces true north. */
    northDeg: number;
    latitude?: number; longitude?: number; elevationM?: number;
  };
  sport: SportId;
  field: { length: Mm; width: Mm; runoffSide: Mm; runoffEnd: Mm };
  bowl: {
    /** first-row distance from the sidelines / touchlines (front of the first tread) */
    sideDistance: Mm;
    /** first-row distance from the end lines / goal lines */
    endDistance: Mm;
    /** plan radius of the corner at the first row (0 = square corner). Rows behind grow it. */
    cornerRadius: Mm;
    targetCapacity: number;
    /** independent stands and corners */
    stands: Partial<Record<StandId | CornerId, StandParams>>;
  };
  seating: {
    seatWidth: Mm;
    aisleWidth: Mm;
    maxSeatsBetweenAisles: number;
    eyeHeight: Mm;
    /** clear width of a lateral cross-aisle (added to the tread in front of the next row) */
    crossAisleWidth: Mm;
    /** wheelchair users' eye height above the platform */
    wheelchairEyeHeight: Mm;
  };
  sightlines: {
    mode: SightlineMode;
    targetC: Mm;
    minC: Mm;
    riserStep: Mm;
    maxRakeDeg: number;
    /** count seats below the minimum C-value as excluded (not sold) */
    excludeBelowMin: boolean;
  };
  tiers: TierParams[];
  /** premium levels inserted into the section */
  premium: PremiumLevel[];
  building: BuildingParams;
}

export const NO_VOMS: VomitoryParams = { enabled: false, every: 2, mouthRow: 8, width: 2800 };

export function tier(id: string, name: string, p: Partial<TierParams> = {}): TierParams {
  return {
    id, name, rows: 24, rowDepth: 800, riser: 380, elevation: 1500, overhang: 0, barrier: 800, kind: 'general', crossAisles: [],
    vomitories: { ...NO_VOMS }, accessible: { perSection: 0, row: 0 }, ...p,
  };
}

export function defaultBuilding(): BuildingParams {
  return {
    concourseWidth: 10000, programDepth: 10000, concourseClear: 4000,
    allowances: { concessions: 0.06, restrooms: 0.07, retail: 0.015, firstAid: 0.003, clubLounge: 1.0 },
    cores: { spacing: 60000, width: 9000, depth: 11000, stairs: 2, stairWidth: 2400, lifts: 2 },
  };
}

export function suiteLevel(id: string, belowTier: string, p: Partial<PremiumLevel> = {}): PremiumLevel {
  return { id, name: 'Suite level', belowTier, kind: 'suites', height: 4500, setback: 4000, stands: ['N', 'S'], unitWidth: 5500, unitDepth: 8000, seatsPerUnit: 16, ...p };
}

export function defaultProject(): Project {
  return {
    schema: SCHEMA_ID, version: SCHEMA_VERSION, name: 'Untitled stadium', units: 'metric',
    site: { northDeg: 90 },
    sport: 'soccer',
    field: { length: 105000, width: 68000, runoffSide: 6000, runoffEnd: 7500 },
    bowl: { sideDistance: 8000, endDistance: 10000, cornerRadius: 12000, targetCapacity: 40000, stands: {} },
    seating: { seatWidth: 500, aisleWidth: 1200, maxSeatsBetweenAisles: 28, eyeHeight: 1200, crossAisleWidth: 1500, wheelchairEyeHeight: 1150 },
    sightlines: { mode: 'cvalue', targetC: 90, minC: 60, riserStep: 10, maxRakeDeg: 34, excludeBelowMin: false },
    tiers: [
      tier('T1', 'Lower tier', { rows: 24, elevation: 1500, accessible: { perSection: 2, row: 0 } }),
      tier('T2', 'Upper tier', { rows: 20, elevation: 4500, overhang: -2000, targetC: 60, accessible: { perSection: 1, row: 1 } }),
    ],
    premium: [],
    building: defaultBuilding(),
  };
}

/** Change sport in place: the field and first-row distances take that sport's defaults; tiers are kept. */
export function switchSport(p: Project, id: SportId) {
  const d = SPORTS[id].defaults;
  p.sport = id;
  p.field = { length: d.length, width: d.width, runoffSide: d.runoffSide, runoffEnd: d.runoffEnd };
  p.bowl.sideDistance = d.sideDistance; p.bowl.endDistance = d.endDistance;
  p.presetId = undefined;
}

// ── persistence ─────────────────────────────────────────────────────────────────────────

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

/**
 * Parse and migrate a saved project. Unknown future versions are refused rather than half-read.
 * v1 → v2: v1 files have no stands, cross-aisles, vomitories or accessible positions; they open with
 * none of these, so a v1 bowl keeps exactly its v1 geometry and seat count.
 * v2 → v3: no premium levels; building allowances take their defaults (they add geometry around the
 * bowl but never move a seat).
 */
export function parseProject(text: string): Project {
  const raw = JSON.parse(text);
  if (raw?.schema !== SCHEMA_ID) throw new Error('Not a MANICAI project file');
  if (typeof raw.version !== 'number' || raw.version > SCHEMA_VERSION) throw new Error(`Project version ${raw.version} is newer than this MANICAI (v${SCHEMA_VERSION})`);
  const d = defaultProject();
  const v1 = raw.version < 2;
  return {
    ...d, ...raw,
    site: { ...d.site, ...raw.site },
    field: { ...d.field, ...raw.field },
    seating: { ...d.seating, ...raw.seating },
    sightlines: { ...d.sightlines, ...raw.sightlines },
    bowl: { ...d.bowl, ...raw.bowl, stands: { ...raw.bowl?.stands } },
    premium: Array.isArray(raw.premium) ? raw.premium.map((l: Partial<PremiumLevel>, i: number) => suiteLevel(l.id ?? `P${i + 1}`, l.belowTier ?? 'T2', l)) : [],
    building: { ...d.building, ...raw.building, allowances: { ...d.building.allowances, ...raw.building?.allowances }, cores: { ...d.building.cores, ...raw.building?.cores } },
    tiers: Array.isArray(raw.tiers) && raw.tiers.length
      ? raw.tiers.map((t: Partial<TierParams>, i: number) => {
        const x = tier(t.id ?? `T${i + 1}`, t.name ?? `Tier ${i + 1}`, t);
        x.vomitories = { ...NO_VOMS, ...t.vomitories };
        x.accessible = { perSection: 0, row: 0, ...t.accessible };
        if (v1) x.accessible.perSection = 0;
        return x;
      })
      : d.tiers,
    version: SCHEMA_VERSION,
  };
}
