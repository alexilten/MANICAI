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
export const SCHEMA_VERSION = 1;

export type SightlineMode = 'cvalue' | 'riser';

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
  };
  seating: {
    seatWidth: Mm;
    aisleWidth: Mm;
    maxSeatsBetweenAisles: number;
    eyeHeight: Mm;
  };
  sightlines: {
    mode: SightlineMode;
    targetC: Mm;
    minC: Mm;
    riserStep: Mm;
    maxRakeDeg: number;
  };
  tiers: TierParams[];
}

export function tier(id: string, name: string, p: Partial<TierParams> = {}): TierParams {
  return { id, name, rows: 24, rowDepth: 800, riser: 380, elevation: 1500, overhang: 0, barrier: 800, ...p };
}

export function defaultProject(): Project {
  return {
    schema: SCHEMA_ID, version: SCHEMA_VERSION, name: 'Untitled stadium', units: 'metric',
    site: { northDeg: 90 },
    sport: 'soccer',
    field: { length: 105000, width: 68000, runoffSide: 6000, runoffEnd: 7500 },
    bowl: { sideDistance: 8000, endDistance: 10000, cornerRadius: 12000, targetCapacity: 40000 },
    seating: { seatWidth: 500, aisleWidth: 1200, maxSeatsBetweenAisles: 28, eyeHeight: 1200 },
    sightlines: { mode: 'cvalue', targetC: 90, minC: 60, riserStep: 10, maxRakeDeg: 34 },
    tiers: [tier('T1', 'Lower tier', { rows: 24, elevation: 1500 }), tier('T2', 'Upper tier', { rows: 20, elevation: 4500, overhang: -2000, targetC: 60 })],
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

/** Parse and migrate a saved project. Unknown future versions are refused rather than half-read. */
export function parseProject(text: string): Project {
  const raw = JSON.parse(text);
  if (raw?.schema !== SCHEMA_ID) throw new Error('Not a MANICAI project file');
  if (typeof raw.version !== 'number' || raw.version > SCHEMA_VERSION) throw new Error(`Project version ${raw.version} is newer than this MANICAI (v${SCHEMA_VERSION})`);
  // v1 is the first schema; fill any missing groups from the defaults so older drafts open
  const d = defaultProject();
  return {
    ...d, ...raw,
    site: { ...d.site, ...raw.site },
    field: { ...d.field, ...raw.field },
    bowl: { ...d.bowl, ...raw.bowl },
    seating: { ...d.seating, ...raw.seating },
    sightlines: { ...d.sightlines, ...raw.sightlines },
    tiers: Array.isArray(raw.tiers) && raw.tiers.length ? raw.tiers.map((t: Partial<TierParams>, i: number) => tier(t.id ?? `T${i + 1}`, t.name ?? `Tier ${i + 1}`, t)) : d.tiers,
    version: SCHEMA_VERSION,
  };
}
