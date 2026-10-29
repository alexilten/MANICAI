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
import { adaRequired } from './engine/accessibility';
import { evaluate, fitRowsToTarget, ROWS_MAX as ROWS_LIMIT } from './engine/optimize';
import { defaultProject, suiteLevel, tier, type Project } from './schema';
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

/**
 * Round 02 planning defaults shared by every preset (MANICAI assumptions, listed in each preset's
 * evidence): wheelchair platforms on every tier, vomitories in deep tiers, club tiers as premium.
 */
function professional(p: Project): Project {
  p.tiers.forEach((t, i) => {
    if (/club|suite/i.test(t.name)) { t.kind = 'club'; t.seatWidth = 550; t.rowDepth = Math.max(t.rowDepth, 900); }
    t.accessible = i === 0 ? { perSection: 2, row: 0 } : { perSection: 1, row: 1 };
    if (t.rows >= 18 && t.kind === 'general') t.vomitories = { enabled: true, every: 2, mouthRow: Math.round(t.rows * 0.4), width: 2800 };
  });
  return p;
}

/** Fit row counts to the target net capacity (keeps the tier proportions), adding wheelchair positions per section until the ADA table is met. */
function fitted(p: Project): Project {
  professional(p);
  for (let pass = 0; pass < 6; pass++) {
    const f = fitRowsToTarget(p);
    p.tiers.forEach((t, i) => { t.rows = f.rows[i]; });
    const { counts } = evaluate(p);
    if (counts.byClass[2] >= adaRequired(counts.net)) break;
    p.tiers.forEach((t) => { t.accessible = { ...t.accessible, perSection: t.accessible.perSection + 1 }; });
  }
  return p;
}

/** Precedent cities (approximate, to a tenth of a degree) for the Round 07 sun study. The pitch orientation of the real sites is not modelled. */
const CITY: Record<string, { lat: number; lon: number; city: string }> = {
  'single-end': { lat: 51.6, lon: -0.1, city: 'London' }, 'steep-end': { lat: 53.4, lon: -3.0, city: 'Liverpool' },
  'freedom-park': { lat: 25.8, lon: -80.2, city: 'Miami' }, allegiant: { lat: 36.1, lon: -115.2, city: 'Las Vegas' },
  chiefs: { lat: 39.1, lon: -94.5, city: 'Kansas City' }, nissan: { lat: 36.2, lon: -86.8, city: 'Nashville' },
  milano: { lat: 45.5, lon: 9.1, city: 'Milan' }, birmingham: { lat: 52.5, lon: -1.9, city: 'Birmingham' },
  sphere: { lat: 36.1, lon: -115.2, city: 'Las Vegas' },
};

const P = (meta: PresetMeta, make: () => Project): Preset => {
  const c = CITY[meta.id];
  const build = c ? () => { const p = make(); p.site = { ...p.site, latitude: c.lat, longitude: c.lon }; return p; } : make;
  // Round 08: fitting rows to the published capacity takes up to a second, so each preset is built once and copied
  let built: Project | null = null;
  const cached = () => structuredClone(built ??= build());
  if (!c) return { ...meta, build: cached };
  return { ...meta, assumed: [...meta.assumed, `Site at the latitude of ${c.city} (≈ ${c.lat}° ${c.lat >= 0 ? 'N' : 'S'}) for the sun study; the pitch orientation is the MANICAI default, not the real site's`], build: cached };
};

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
      verified: [], assumed: ['One suite level between the club level and the upper bowl, suites on both sidelines', 'Canopies over both sideline stands', 'All dimensions are MANICAI planning defaults.'], confidence: 'generic' },
    () => {
      const p = base('nfl', 'Generic NFL bowl', 'generic-nfl');
      p.bowl.targetCapacity = 65000; p.bowl.cornerRadius = 16000;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 30, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 10, elevation: 4500, overhang: -4000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 24, elevation: 4500, overhang: -2500, targetC: 60 }),
      ];
      p.sightlines.maxRakeDeg = 35;
      p.premium = [suiteLevel('P1', 'T3', { name: 'Suite level' })];
      p.architecture.roof = { ...p.architecture.roof, type: 'canopy', stands: ['N', 'S'] };
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
  P({ id: 'horseshoe', name: 'Horseshoe ground', short: 'Three stands, one open end', category: 'generic', sport: 'soccer',
      verified: [], assumed: ['East end left open (a horseshoe), e.g. for a view, a stage or a future stand.', 'Corners next to the open end follow the open end and stay empty.'], confidence: 'generic' },
    () => {
      const p = base('soccer', 'Horseshoe ground', 'horseshoe');
      p.bowl.targetCapacity = 32000; p.bowl.cornerRadius = 9000;
      p.bowl.stands = { E: { open: true } };
      p.tiers = [tier('T1', 'Lower tier', { rows: 24, elevation: 1300 }), tier('T2', 'Upper tier', { rows: 18, elevation: 4500, overhang: -4500, targetC: 60 })];
      p.architecture.roof = { ...p.architecture.roof, type: 'canopy', stands: ['N', 'S', 'W'] };
      return fitted(p);
    }),
  P({ id: 'single-end', name: 'Big single-tier end — Tottenham-inspired', short: '62,850 · two-tier bowl with one huge single-tier end', category: 'precedent', sport: 'soccer', precedent: 'tottenham',
      verified: ['Premier League stadium (Populous), opened 2019', 'Capacity 62,850 (recalled)', 'Single-tier South Stand of about 17,500 seats (recalled)'],
      assumed: ['Roof modelled as a continuous perimeter canopy', 'The single-tier end is the west end here (MANICAI puts the ends on ±X)', 'Lower tier extended at the west end to about 1¾ times its depth, upper tier dropped there; 35° rake limit', 'Two tiers elsewhere; row counts fitted to 62,850 net', 'Not the architects\' geometry — rake, tier split and distances are MANICAI assumptions'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Big single-tier end (Tottenham-inspired)', 'single-end');
      p.field.runoffSide = 5500; p.field.runoffEnd = 6000;
      p.sightlines.maxRakeDeg = 35;
      p.bowl = { sideDistance: 7500, endDistance: 7000, cornerRadius: 8000, targetCapacity: 62850, stands: {} };
      p.tiers = [tier('T1', 'Lower tier', { rows: 26, elevation: 1300 }), tier('T2', 'Upper tier', { rows: 26, elevation: 4800, overhang: -6000, targetC: 60 })];
      fitted(p);
      // the west end: one tier as deep as both tiers together, and no upper tier
      const deep = Math.min(ROWS_LIMIT, Math.round(p.tiers[0].rows + p.tiers[1].rows * 0.75));
      p.bowl.stands = { W: { rows: { T1: deep, T2: 0 } } };
      p.architecture.roof.type = 'perimeter';
      return fitted(p);
    }),
  P({ id: 'steep-end', name: 'Four stands with a steep home end — Everton-inspired', short: '52,888 · square corners, single-tier end at the rake limit', category: 'precedent', sport: 'soccer', precedent: 'everton',
      verified: ['Premier League stadium (MEIS lead, BDP), opened 2025', 'Capacity 52,888', 'Single-tier South Stand at 33.89° maximum rake, "as steep as regulations allow" (RIBAJ)'],
      assumed: ['Roof modelled as a continuous perimeter canopy', 'Four separate stands with square corners', 'The single-tier home end is the west end here, at the 34° limit with tight 7 m goal-line distance', 'Two tiers on the other three stands; row counts fitted to 52,888 net'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Four stands with a steep home end (Everton-inspired)', 'steep-end');
      p.field.runoffSide = 5500; p.field.runoffEnd = 6000;
      p.bowl = { sideDistance: 7500, endDistance: 8500, cornerRadius: 0, targetCapacity: 52888, stands: {} };
      p.tiers = [tier('T1', 'Lower tier', { rows: 24, elevation: 1200 }), tier('T2', 'Upper tier', { rows: 22, elevation: 4600, overhang: -5000, targetC: 60 })];
      fitted(p);
      const deep = Math.min(ROWS_LIMIT, Math.round(p.tiers[0].rows + p.tiers[1].rows * 0.75));
      p.bowl.stands = { W: { distance: 7000, rows: { T1: deep, T2: 0 } } };
      p.architecture.roof.type = 'perimeter';
      return fitted(p);
    }),
  P({ id: 'freedom-park', name: 'Intimate soccer bowl — Inter Miami-inspired', short: '25,000 · soccer-specific, close to the pitch', category: 'precedent', sport: 'soccer', precedent: 'miami-freedom-park',
      verified: ['MLS soccer-specific stadium (MANICA), opened Apr 2026', 'Published capacity 25,000 (Dezeen; Wikipedia gives 26,700)', 'Lower and upper bowl'],
      assumed: ['Roof modelled as a continuous perimeter canopy', 'First row 6 m from touchlines, 7.5 m from goal lines', 'Two tiers; row counts fitted to 25,000', 'Pitch 105 × 68 m'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Intimate soccer bowl (Inter Miami-inspired)', 'freedom-park');
      p.field.runoffSide = 5000; p.field.runoffEnd = 6500;
      p.bowl = { sideDistance: 6000, endDistance: 7500, cornerRadius: 7000, targetCapacity: 25000, stands: {} };
      p.tiers = [tier('T1', 'Lower bowl', { rows: 20, elevation: 1200 }), tier('T2', 'Upper bowl', { rows: 12, elevation: 4200, overhang: -6000, targetC: 60 })];
      p.architecture.roof.type = 'perimeter';
      return fitted(p);
    }),
  P({ id: 'allegiant', name: 'Compact enclosed NFL bowl — Allegiant-inspired', short: '65,000 · enclosed multipurpose NFL', category: 'precedent', sport: 'nfl', precedent: 'allegiant',
      verified: ['NFL stadium, MANICA design architect with HNTB, opened 2020', 'Capacity 65,000 (expandable to 71,835)', 'Fixed translucent ETFE roof; ten-level building; 128 suites'],
      assumed: ['Two suite levels on both sidelines; the suite count is what fits at 5.5 m per suite, not the published 128', 'Three tiers (lower, club/suite, upper) — tier split not published', 'First row 15 m from sidelines', 'ETFE roof drawn as a shallow dome on long-span trusses; heights and spans are MANICAI assumptions'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Compact enclosed NFL bowl (Allegiant-inspired)', 'allegiant');
      p.bowl = { sideDistance: 15000, endDistance: 11000, cornerRadius: 14000, targetCapacity: 65000, stands: {} };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 32, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 9, elevation: 5000, overhang: -3500, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 26, elevation: 5200, overhang: -2000, targetC: 60 }),
      ];
      p.premium = [suiteLevel('P1', 'T2', { name: 'Lower suite level', setback: 6000 }), suiteLevel('P2', 'T3', { name: 'Upper suite level', setback: 9000 })];
      p.architecture.roof = { ...p.architecture.roof, type: 'etfe', material: 'etfe' };
      return fitted(p);
    }),
  P({ id: 'chiefs', name: 'Large NFL atmosphere bowl — Chiefs-inspired', short: '≈70,000 · enclosed, steep and loud', category: 'precedent', sport: 'nfl', precedent: 'kc-chiefs',
      verified: ['In design (renderings Jul 2026), MANICA lead design architect, HNTB architect of record', 'About 70,000 seats', 'Enclosed translucent ETFE roof; bowl described as recalling Arrowhead, shaped for crowd noise'],
      assumed: ['One suite level on both sidelines (suite count not published)', 'Three tiers with a steep upper bowl (35°)', 'Tight 14 m sideline distance', 'ETFE roof drawn as a shallow dome on long-span trusses', 'Row counts fitted to 70,000'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Large NFL atmosphere bowl (Chiefs-inspired)', 'chiefs');
      p.bowl = { sideDistance: 14000, endDistance: 10000, cornerRadius: 18000, targetCapacity: 70000, stands: {} };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 34, elevation: 1800 }),
        tier('T2', 'Club level', { rows: 8, elevation: 5000, overhang: -3000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 30, elevation: 4800, overhang: -4500, targetC: 60 }),
      ];
      p.premium = [suiteLevel('P1', 'T3', { name: 'Suite level', setback: 9000 })];
      p.architecture.roof = { ...p.architecture.roof, type: 'etfe', material: 'etfe' };
      return fitted(p);
    }),
  P({ id: 'nissan', name: 'Enclosed NFL stadium — New Nissan-inspired', short: '60,000 · enclosed, tiered football seating', category: 'precedent', sport: 'nfl', precedent: 'new-nissan',
      verified: ['Under construction, MANICA designer, opening 2027', 'Capacity 60,000 (55–60,000 proposed)', 'Enclosed translucent ETFE roof; ~170 suites'],
      assumed: ['Two suite levels, the upper one wrapping all four stands; the suite count is what fits, not the published ~170', 'Three tiers', 'ETFE roof drawn as a shallow dome on long-span trusses', 'Row counts fitted to 60,000'], confidence: 'low' },
    () => {
      const p = base('nfl', 'Enclosed NFL stadium (New Nissan-inspired)', 'nissan');
      p.bowl = { sideDistance: 15000, endDistance: 11000, cornerRadius: 15000, targetCapacity: 60000, stands: {} };
      p.sightlines.maxRakeDeg = 35;
      p.tiers = [
        tier('T1', 'Lower bowl', { rows: 30, elevation: 1800 }),
        tier('T2', 'Suite & club level', { rows: 7, elevation: 5500, overhang: -4000, targetC: 60 }),
        tier('T3', 'Upper bowl', { rows: 24, elevation: 5000, overhang: -2000, targetC: 60 }),
      ];
      p.premium = [suiteLevel('P1', 'T2', { name: 'Lower suite level', setback: 6000 }), suiteLevel('P2', 'T3', { name: 'Upper suite level', setback: 9000, stands: ['N', 'S', 'E', 'W'] })];
      p.architecture.roof = { ...p.architecture.roof, type: 'etfe', material: 'etfe' };
      return fitted(p);
    }),
  P({ id: 'milano', name: 'European two-tier bowl — Milan-inspired', short: '71,500 · two large tiers, oval, steep', category: 'precedent', sport: 'soccer', precedent: 'milano',
      verified: ['In design (Foster + Partners and MANICA)', '71,500 seats, > 13,000 premium', 'Two large tiers, more oval than the Meazza; curve sections up to ~37° (preliminary press figure)'],
      assumed: ['One suite level between the two rings on both sidelines; the published >13,000 premium seats also include club seating not modelled here', 'Max rake 37° (Italian rules differ from the UK 34°)', 'Roof over the stands only (pitch open), drawn as a perimeter canopy', 'Generous corner radius for a softer plan (a truly oval, bowed plan needs Round 02 stand curvature)', 'Row counts fitted to 71,500'], confidence: 'low' },
    () => {
      const p = base('soccer', 'European two-tier bowl (Milan-inspired)', 'milano');
      p.bowl = { sideDistance: 8500, endDistance: 10500, cornerRadius: 16000, targetCapacity: 71500, stands: {} };
      p.sightlines.maxRakeDeg = 37;
      p.tiers = [tier('T1', 'First ring', { rows: 30, elevation: 1500 }), tier('T2', 'Second ring', { rows: 32, elevation: 5000, overhang: -6000, targetC: 60 })];
      p.premium = [suiteLevel('P1', 'T2', { name: 'Suite level', setback: 6000 })];
      p.architecture.roof.type = 'perimeter';
      return fitted(p);
    }),
  P({ id: 'birmingham', name: 'Club stadium with strong ends — Birmingham-inspired', short: '62,000 · traditional bowl, big home end', category: 'precedent', sport: 'soccer', precedent: 'birmingham-city',
      verified: ['In design: Heatherwick Studio lead, MANICA collaborating', '62,000 seats', '"Traditional seating bowl"; roof hung from 12 brick chimneys'],
      assumed: ['Retractable roof drawn as two sliding panels on track trusses; the published chimneys are not modelled', 'Two tiers, tight end stands (7 m from goal lines)', 'Row counts fitted to 62,000'], confidence: 'low' },
    () => {
      const p = base('soccer', 'Club stadium with strong ends (Birmingham-inspired)', 'birmingham');
      p.field.runoffEnd = 6000;
      p.bowl = { sideDistance: 8000, endDistance: 7000, cornerRadius: 8000, targetCapacity: 62000, stands: {} };
      p.tiers = [tier('T1', 'Lower tier', { rows: 26, elevation: 1300 }), tier('T2', 'Upper tier', { rows: 30, elevation: 4800, overhang: -6000, targetC: 60 })];
      p.architecture.roof = { ...p.architecture.roof, type: 'retractable', material: 'metal' };
      return fitted(p);
    }),
  P({ id: 'sphere', name: 'Spherical immersive venue — Sphere-inspired', short: '17,600 · LED sphere, wraparound screen, steep amphitheatre', category: 'precedent', sport: 'stage', precedent: 'sphere',
      verified: [
        'Immersive concert and film venue (Populous), opened 29 Sep 2023, Las Vegas',
        '17,600 seated, 20,000 with the standing floor; all seats face the stage; seating takes about two-thirds of the interior, the stage the rest',
        'Four seating tiers (100–400 levels) and two suite levels; 23 suites; lowest tier partly retractable',
        'Exosphere: 516 ft (157 m) wide, 366 ft (112 m) tall; 580,000 ft² of LED, about 1.2 million pucks at 8 in centres on a steel diagrid independent of the building',
        'Interior LED media plane: about 160,000 ft² (15,000 m²), 16K, wrapping over the audience to an apex 240 ft (73 m) above the event floor; 400 ft (122 m) dome',
        'Dome of 32 radial trusses with a compression ring; the concourse roof acts as the tension ring (Severud)',
        'Main loudspeaker array of 14 clusters 25–30 ft above the stage; about 10,000 haptic seats',
      ],
      assumed: [
        'Horseshoe plan opening onto a stage at the east end: a 42 × 28 m event floor and a 16 m deep stage deck at +1.5 m; sightlines are taken to a 26 × 12 m strip in front of the stage',
        'Tier rows fitted to 17,600 with the suite seats; tier heights, rows and row depths (760 mm) are not published',
        'Suite levels under the 200 and 300 levels round the back of the horseshoe, overhanging the 100 level from about row 25; the suite count is what fits at 9 m per suite, not the published 23',
        '40° rake limit for the steep upper levels (steeper than the 34° football guidance); at that limit the back rows of the 300 and 400 levels fall below the 60 mm C-value, which the checks report',
        'The Exosphere, dome and media plane keep the published proportions (366/516 height to width, apex 1.2 × the interior radius, 160,000 ft² screen share) but Manica sizes them to clear this bowl, so they come out larger than built: about 188 m wide and 134 m tall, an 84 m apex and about 19,000 m² of media plane',
        'Interior: a cylinder under a spherical cap; the media plane is the part of it seen within a cone from mid-bowl aimed at the stage. The dome shell sits 4.5 m outside it for catwalks and rigging',
        'No floodlights: production lighting rigs through the media plane. The loudspeaker array is drawn as 14 boxes above the stage; haptic seats are not modelled',
      ], confidence: 'low' },
    () => {
      const p = base('stage', 'Spherical immersive venue (Sphere-inspired)', 'sphere');
      // sightlines to a 26 × 12 m strip of a 42 × 28 m event floor; the horseshoe's west end is a semicircle
      p.field = { length: 26000, width: 12000, runoffSide: 8000, runoffEnd: 8000 };
      p.bowl = { sideDistance: 9000, endDistance: 9000, cornerRadius: 15000, targetCapacity: 17600, stands: { E: { open: true }, NE: { open: true }, SE: { open: true } } };
      p.sightlines.maxRakeDeg = 40;
      p.seating.maxSeatsBetweenAisles = 40;
      p.tiers = [
        tier('T1', '100 level', { rows: 25, elevation: 600, rowDepth: 760, targetC: 60 }),
        tier('T2', '200 level', { rows: 13, elevation: 2000, overhang: 2000, rowDepth: 760, targetC: 60 }),
        tier('T3', '300 level', { rows: 11, elevation: 2000, overhang: 1500, rowDepth: 760, targetC: 60 }),
        tier('T4', '400 level', { rows: 14, elevation: 4000, overhang: 1500, rowDepth: 760, targetC: 60 }),
      ];
      p.premium = [
        suiteLevel('P1', 'T2', { name: 'Suite level 1', height: 3600, setback: 0, stands: ['W', 'N', 'S'], unitWidth: 9000, unitDepth: 6000, seatsPerUnit: 30 }),
        suiteLevel('P2', 'T3', { name: 'Suite level 2', height: 3600, setback: 0, stands: ['W', 'N', 'S'], unitWidth: 9000, unitDepth: 6000, seatsPerUnit: 30 }),
      ];
      p.building = { ...p.building, concourseWidth: 5000, programDepth: 3500, cores: { ...p.building.cores, depth: 5000 } };
      p.architecture.roof = { ...p.architecture.roof, type: 'sphere', material: 'metal', clearance: 3000, skyView: 20000 };
      p.architecture.facade = { ...p.architecture.facade, portals: 0 };
      p.architecture.boh.mainStand = 'N';
      p.systems.boards = { ...p.systems.boards, type: 'none', ribbon: false };
      p.systems.lighting = { ...p.systems.lighting, mount: 'roof' };
      p.systems.service = { ...p.systems.service, fieldAccess: 'E', yard: 'auto' };
      return fitted(p);
    }),
];

export const DEFAULT_PRESET = PRESETS[0];
export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET;
export const precedentOf = (p: PresetMeta) => (p.precedent ? PRECEDENTS.find((x) => x.id === p.precedent) : undefined);
export const PRESETS_CHECKED = CHECKED;
