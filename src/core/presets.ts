/**
 * Bowl presets.
 *
 * Precedent-informed presets are independent parametric studies, reconstructed only from public
 * facts (sport, published capacity, tier count where reported, roof type). They are not copies of
 * any studio's drawings or CAD. The geometry beyond those facts is MANICAI's assumption, so every
 * preset carries its evidence and a confidence level, and row counts are fitted by the engine to
 * the published capacity rather than tuned by hand.
 */
import { CHECKED, PRECEDENTS } from './data/precedents';
import { fitRowsToTarget } from './engine/optimize';
import { defaultProject, tier, type Project } from './schema';
import { SPORTS, type SportId } from './sports';

export type Confidence = 'generic' | 'low' | 'medium';
export interface PresetMeta {
  id: string;
  name: string;
  short: string;
  category: 'generic' | 'precedent';
  sport: SportId;
  /** precedent library id */
  precedent?: string;
  /** what is published (see the precedent entry for sources) */
  verified: string[];
  /** what MANICAI assumed to build a bowl */
  assumed: string[];
  confidence: Confidence;
}
export interface Preset extends PresetMeta { build: () => Project }

function base(sport: SportId, name: string, id: string): Project {
  const p = defaultProject();
  const d = SPORTS[sport].defaults;
  p.name = name; p.presetId = id; p.sport = sport;
  p.field = { length: d.length, width: d.width, runoffSide: d.runoffSide, runoffEnd: d.runoffEnd };
  p.bowl.sideDistance = d.sideDistance; p.bowl.endDistance = d.endDistance;
  if (sport === 'nfl') p.units = 'imperial';
  return p;
}

/** Fit row counts to the target capacity (keeps the tier proportions). */
function fitted(p: Project): Project {
  const f = fitRowsToTarget(p);
  p.tiers.forEach((t, i) => { t.rows = f.rows[i]; });
  return p;
}

const P = (meta: PresetMeta, build: () => Project): Preset => ({ ...meta, build });

export const PRESETS: Preset[] = [
  P({ id: 'generic-soccer', name: 'Generic soccer bowl', short: 'Two-tier football bowl, 105 × 68 m pitch', category: 'generic', sport: 'soccer',
      verified: [], assumed: ['All dimensions are MANICAI planning defaults.'], confidence: 'generic' },
    () => {
      const p = base('soccer', 'Generic soccer bowl', 'generic-soccer');
      p.bowl.targetCapacity = 42000;
      p.tiers = [tier('T1', 'Lower tier', { rows: 24, elevation: 1500 }), tier('T2', 'Upper tier', { rows: 20, elevation: 4500, overhang: -5000, targetC: 60 })];
      return fitted(p);
    }),
  P({ id: 'generic-nfl', name: 'Generic NFL bowl', short: 'Three-tier football bowl with a club level', category: 'generic', sport: 'nfl',
      verified: [], assumed: ['All dimensions are MANICAI planning defaults.'], confidence: 'generic' },
    () => {
      const p = base('nfl', 'Generic NFL bowl', 'generic-nfl');
      p.bowl.targetCapacity = 65000; p.bowl.cornerRadius = 16000;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 30, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 10, elevation: 4500, overhang: -4000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 24, elevation: 4500, overhang: -2500, targetC: 60 }),
      ];
      p.sightlines.maxRakeDeg = 35;
      return fitted(p);
    }),
  P({ id: 'four-stand', name: 'Four-stand ground', short: 'Square corners: four separate stands', category: 'generic', sport: 'soccer',
      verified: [], assumed: ['Corner radius 0: the offset rows open into fans, leaving corners empty — the classic British four-stand layout.'], confidence: 'generic' },
    () => {
      const p = base('soccer', 'Four-stand ground', 'four-stand');
      p.bowl.cornerRadius = 0; p.bowl.sideDistance = 7000; p.bowl.endDistance = 8500; p.bowl.targetCapacity = 30000;
      p.tiers = [tier('T1', 'Lower tier', { rows: 22, elevation: 1200 }), tier('T2', 'Upper tier', { rows: 16, elevation: 4200, overhang: -4000, targetC: 60 })];
      return fitted(p);
    }),
  P({ id: 'freedom-park', name: 'Intimate soccer bowl — Inter Miami-inspired', short: '25,000 · soccer-specific, close to the pitch', category: 'precedent', sport: 'soccer', precedent: 'miami-freedom-park',
      verified: ['MLS soccer-specific stadium (MANICA), opened Apr 2026', 'Published capacity 25,000 (Dezeen; Wikipedia gives 26,700)', 'Lower and upper bowl'],
      assumed: ['First row 6 m from touchlines, 7.5 m from goal lines', 'Two tiers; row counts fitted to 25,000', 'Pitch 105 × 68 m'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Intimate soccer bowl (Inter Miami-inspired)', 'freedom-park');
      p.field.runoffSide = 5000; p.field.runoffEnd = 6500;
      p.bowl = { sideDistance: 6000, endDistance: 7500, cornerRadius: 7000, targetCapacity: 25000 };
      p.tiers = [tier('T1', 'Lower bowl', { rows: 20, elevation: 1200 }), tier('T2', 'Upper bowl', { rows: 12, elevation: 4200, overhang: -6000, targetC: 60 })];
      return fitted(p);
    }),
  P({ id: 'allegiant', name: 'Compact enclosed NFL bowl — Allegiant-inspired', short: '65,000 · enclosed multipurpose NFL', category: 'precedent', sport: 'nfl', precedent: 'allegiant',
      verified: ['NFL stadium, MANICA design architect with HNTB, opened 2020', 'Capacity 65,000 (expandable to 71,835)', 'Fixed translucent ETFE roof; ten-level building; 128 suites'],
      assumed: ['Three tiers (lower, club/suite, upper) — tier split not published', 'First row 15 m from sidelines', 'Roof not generated until Round 04'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Compact enclosed NFL bowl (Allegiant-inspired)', 'allegiant');
      p.bowl = { sideDistance: 15000, endDistance: 11000, cornerRadius: 14000, targetCapacity: 65000 };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 32, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 9, elevation: 5000, overhang: -3500, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 26, elevation: 5200, overhang: -2000, targetC: 60 }),
      ];
      return fitted(p);
    }),
  P({ id: 'chiefs', name: 'Large NFL atmosphere bowl — Chiefs-inspired', short: '≈70,000 · enclosed, steep and loud', category: 'precedent', sport: 'nfl', precedent: 'kc-chiefs',
      verified: ['In design (renderings Jul 2026), MANICA lead design architect, HNTB architect of record', 'About 70,000 seats', 'Enclosed translucent ETFE roof; bowl described as recalling Arrowhead, shaped for crowd noise'],
      assumed: ['Three tiers with a steep upper bowl (35°)', 'Tight 14 m sideline distance', 'Row counts fitted to 70,000'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Large NFL atmosphere bowl (Chiefs-inspired)', 'chiefs');
      p.bowl = { sideDistance: 14000, endDistance: 10000, cornerRadius: 18000, targetCapacity: 70000 };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 34, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 8, elevation: 5000, overhang: -3000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 30, elevation: 4800, overhang: -4500, targetC: 60 }),
      ];
      return fitted(p);
    }),
  P({ id: 'nissan', name: 'Enclosed NFL stadium — New Nissan-inspired', short: '60,000 · enclosed, tiered football seating', category: 'precedent', sport: 'nfl', precedent: 'new-nissan',
      verified: ['Under construction, MANICA designer, opening 2027', 'Capacity 60,000 (55–60,000 proposed)', 'Enclosed translucent ETFE roof; ~170 suites'],
      assumed: ['Three tiers', 'Row counts fitted to 60,000'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Enclosed NFL stadium (New Nissan-inspired)', 'nissan');
      p.bowl = { sideDistance: 15000, endDistance: 11000, cornerRadius: 15000, targetCapacity: 60000 };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 30, elevation: 1800 }),
        tier('T2', 'Suite & club level', { rows: 7, elevation: 5500, overhang: -4000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 24, elevation: 5000, overhang: -2000, targetC: 60 }),
      ];
      return fitted(p);
    }),
  P({ id: 'milano', name: 'European two-tier bowl — Milan-inspired', short: '71,500 · two large tiers, oval, steep', category: 'precedent', sport: 'soccer', precedent: 'milano',
      verified: ['In design (Foster + Partners and MANICA)', '71,500 seats, > 13,000 premium', 'Two large tiers, more oval than the Meazza; curve sections up to ~37° (preliminary press figure)'],
      assumed: ['Max rake 37° (Italian rules differ from the UK 34°)', 'Generous corner radius for a softer plan (a truly oval, bowed plan needs Round 02 stand curvature)', 'Row counts fitted to 71,500'], confidence: 'low' },
    () => {
      const p = base('soccer', 'European two-tier bowl (Milan-inspired)', 'milano');
      p.bowl = { sideDistance: 8500, endDistance: 10500, cornerRadius: 16000, targetCapacity: 71500 };
      p.sightlines.maxRakeDeg = 37;
      p.tiers = [tier('T1', 'First ring', { rows: 30, elevation: 1500 }), tier('T2', 'Second ring', { rows: 32, elevation: 5000, overhang: -6000, targetC: 60 })];
      return fitted(p);
    }),
  P({ id: 'birmingham', name: 'Club stadium with strong ends — Birmingham-inspired', short: '62,000 · traditional bowl, big home end', category: 'precedent', sport: 'soccer', precedent: 'birmingham-city',
      verified: ['In design: Heatherwick Studio lead, MANICA collaborating', '62,000 seats', '"Traditional seating bowl"; roof hung from 12 brick chimneys'],
      assumed: ['Two tiers, tight end stands (7 m from goal lines)', 'Row counts fitted to 62,000'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Club stadium with strong ends (Birmingham-inspired)', 'birmingham');
      p.field.runoffEnd = 6000;
      p.bowl = { sideDistance: 8000, endDistance: 7000, cornerRadius: 8000, targetCapacity: 62000 };
      p.tiers = [tier('T1', 'Lower tier', { rows: 26, elevation: 1300 }), tier('T2', 'Upper tier', { rows: 30, elevation: 4800, overhang: -6000, targetC: 60 })];
      return fitted(p);
    }),
];

export const DEFAULT_PRESET = PRESETS[0];
export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
export const precedentOf = (p: PresetMeta) => (p.precedent ? PRECEDENTS.find((x) => x.id === p.precedent) : undefined);
export const PRESETS_CHECKED = CHECKED;
