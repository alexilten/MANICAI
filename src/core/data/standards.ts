/**
 * Standards & constraints registry.
 *
 * Every number the engine uses that comes from outside Manica is listed here with its source,
 * so the UI and the exports can say where a value came from and how far to trust it.
 *
 *   kind
 *     governing        — a sport's own rules (field geometry). Binding for that competition.
 *     guidance         — published design guidance (FIFA, UEFA, SGSA Green Guide). Recommendations,
 *                        not building code; national regulations and the authority having jurisdiction decide.
 *     assumption       — a Manica planning default. Configurable; not from any code.
 *     engineer-review  — topics Manica represents only conceptually; needs qualified review.
 *
 *   verification
 *     checked          — read against the cited source on `checked` date (URL given)
 *     recall           — from professional reference knowledge, not re-read this round: verify before relying on it
 */
export type RuleKind = 'governing' | 'guidance' | 'assumption' | 'engineer-review';
export interface Rule {
  id: string;
  topic: string;
  statement: string;
  value?: string;
  kind: RuleKind;
  source: string;
  url?: string;
  verification: 'checked' | 'recall';
  checked?: string;
}

const FIFA_BOWL = 'https://publications.fifa.com/en/football-stadiums-guidelines/general-process-guidelines/design/stadium-bowl';
const NFL_2024 = 'https://operations.nfl.com/media/24emxacq/2024-nfl-rulebook.pdf';
const IFAB_L1 = 'https://www.theifab.com/laws/latest/the-field-of-play/';

export const RULES: Rule[] = [
  // ── field: association football
  { id: 'ifab.law1.dimensions', topic: 'Soccer field', kind: 'governing', verification: 'recall', source: 'IFAB Laws of the Game, Law 1', url: IFAB_L1,
    statement: 'Touchline 90–120 m and goal line 45–90 m; for international matches 100–110 m × 64–75 m.', value: '100–110 × 64–75 m (international)' },
  { id: 'ifab.law1.markings', topic: 'Soccer markings', kind: 'governing', verification: 'recall', source: 'IFAB Laws of the Game, Law 1', url: IFAB_L1,
    statement: 'Lines ≤ 12 cm wide; goal 7.32 m × 2.44 m; goal area 5.5 m; penalty area 16.5 m; penalty mark 11 m; centre circle and penalty arc 9.15 m; corner arc 1 m.' },
  { id: 'fifa.pitch.105x68', topic: 'Soccer field', kind: 'guidance', verification: 'recall', source: 'FIFA Football Stadiums Guidelines', url: FIFA_BOWL,
    statement: 'FIFA recommends 105 m × 68 m for new stadiums hosting top-level competition.', value: '105 × 68 m' },
  { id: 'fifa.runoff.min', topic: 'Pitch perimeter', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3 Stadium bowl', url: FIFA_BOWL,
    statement: 'A level run-off of at least 2 m at the field edge; perimeter slope no more than 5°.', value: '≥ 2 m' },
  // ── field: NFL
  { id: 'nfl.rule1.field', topic: 'NFL field', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1 Sec. 1 Art. 1', url: NFL_2024,
    statement: 'Rectangular field 360 ft × 160 ft; goal lines 10 yd from each end line (10-yd end zones).', value: '360 × 160 ft' },
  { id: 'nfl.rule1.border', topic: 'NFL field', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1 Sec. 1 Art. 2', url: NFL_2024,
    statement: 'Solid white border a minimum of 6 ft wide along the end lines and sidelines; coaches\' line 6 ft behind the border.', value: '≥ 6 ft' },
  { id: 'nfl.rule1.lines', topic: 'NFL markings', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1 Sec. 2', url: NFL_2024,
    statement: 'Lines 4 in wide; goal lines 8 in; yard numbers 2 yd tall with bottoms 12 yd in from each sideline.' },
  { id: 'nfl.rule1.hash', topic: 'NFL markings', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1', url: NFL_2024,
    statement: 'Inbounds lines (hash marks) 70 ft 9 in from each sideline; marks 2 ft long.', value: "70'9\"" },
  { id: 'nfl.rule1.goalposts', topic: 'NFL goal posts', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1 Sec. 3', url: NFL_2024,
    statement: 'Crossbar 18 ft 6 in long, top face 10 ft above ground; uprights extend 35 ft above the crossbar; posts on the end lines.' },
  { id: 'nfl.rule1.benches', topic: 'NFL team area', kind: 'governing', verification: 'checked', checked: '2026-10-25', source: '2024 NFL Rulebook, Rule 1 Sec. 1 Art. 2', url: NFL_2024,
    statement: 'Players\' benches a minimum 30 ft back from the sidelines.', value: '≥ 30 ft' },
  { id: 'manica.nfl.teamarea', topic: 'NFL team area', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Team areas drawn between the 32-yard lines, from the border to the 30 ft bench line. Verify the extent against the current NFL Rulebook and league operations requirements.' },
  { id: 'manica.stage', topic: 'Event floor and stage', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Event venues replace the playing field with a flat event floor (standing or retractable seating) and a raised stage at its east end, 16 m deep at +1.5 m, spanning the floor. The sightline focus is the nearest edge of the floor at floor level. Production, rigging and stage-house requirements come from the operator.' },
  // ── sightlines
  { id: 'fifa.cvalue', topic: 'Sightlines', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3', url: FIFA_BOWL,
    statement: 'C-value: 60 mm minimum recommended; 90 mm preferred, rising to 120 mm (optimal, eyes to top of head). Avoid C = 60 in lower tiers where possible.', value: '60 / 90 / 120 mm' },
  { id: 'cvalue.formula', topic: 'Sightlines', kind: 'guidance', verification: 'recall', source: 'SGSA Guide to Safety at Sports Grounds (Green Guide); G. John & R. Sheard, Stadia',
    statement: 'C = D(N + R) / (D + T) − R, with D the horizontal distance from the eye to the point of focus, R the eye height above it, N the riser and T the tread (row depth). Solving for N gives the riser that achieves a target C.' },
  { id: 'fifa.viewing.distance', topic: 'Viewing distance', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3', url: FIFA_BOWL,
    statement: 'Seats should lie within a 150 m arc of the far pitch corner (optimum) and no further than 190 m (maximum).', value: '150 m / 190 m' },
  { id: 'fifa.highball', topic: 'Sightlines', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3', url: FIFA_BOWL,
    statement: 'Clear view of a ball 15 m above the pitch centre, and at least 5 m above the far goal or touchline (roof and upper-tier overhang check — Round 02/04).' },
  { id: 'greenguide.rake', topic: 'Rake', kind: 'guidance', verification: 'recall', source: 'SGSA Green Guide (6th ed., 2018) — UK',
    statement: 'Seated tiers should not exceed 34°. Everton\'s South Stand (2025) is reported at 33.89°, "as steep as regulations allow" (RIBA Journal).', value: '34°' },
  // ── seating & circulation
  { id: 'greenguide.seat', topic: 'Seat & row', kind: 'guidance', verification: 'recall', source: 'SGSA Green Guide (6th ed., 2018) — UK',
    statement: 'Seat width ≥ 460 mm (500 mm recommended); seat row depth ≥ 700 mm (800 mm recommended); seatway clearance ≥ 400 mm.' },
  { id: 'greenguide.seatsrow', topic: 'Seat & row', kind: 'guidance', verification: 'recall', source: 'SGSA Green Guide (6th ed., 2018) — UK',
    statement: 'No more than 28 seats in a row between gangways (14 with a gangway at one end only). US codes (IBC/NFPA 101) differ: they scale row clearance with row length.' },
  { id: 'fifa.circulation', topic: 'Circulation', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3', url: FIFA_BOWL,
    statement: 'Routes ≥ 1.2 m; wheelchair routes ≥ 1.8 m; head clearance 2.4 m where possible; ideally no more than 36 risers in a stair run.' },
  { id: 'fifa.accessible.position', topic: 'Accessibility', kind: 'guidance', verification: 'checked', checked: '2026-10-25', source: 'FIFA Football Stadiums Guidelines §2.3', url: FIFA_BOWL,
    statement: 'Wheelchair position with companion 1.4 m × 1.4 m minimum; companion seat ≥ 500 mm. Required numbers come from local law (e.g. 2010 ADA Standards 221.2 in the US).' },
  { id: 'ada.221', topic: 'Accessibility', kind: 'governing', verification: 'recall', source: '2010 ADA Standards for Accessible Design, 221.2.1.1 (US)', url: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    statement: 'Wheelchair spaces by total seating: 501–5,000 seats: 6 plus 1 per 150 over 500; over 5,000: 36 plus 1 per 200 over 5,000. Each space needs a companion seat beside it. Applies in the US only; other jurisdictions set their own numbers.' },
  // ── Manica planning assumptions
  { id: 'manica.eye', topic: 'Sightlines', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Seated eye point 1200 mm above the tread, 400 mm in front of the riser behind. Configurable.' },
  { id: 'manica.riserstep', topic: 'Rake', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Solved risers round up to 10 mm increments (precast-friendly). Configurable.' },
  { id: 'manica.barrier', topic: 'Barriers', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Front-of-tier barrier 800 mm above the first tread for the first-row sightline check (the Green Guide minimum in front of seated rows; 1100 mm where people can walk behind it). Barrier heights are set by local code and loading standards.' },
  { id: 'manica.aisle', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Radial aisles 1200 mm clear (FIFA minimum route width) at every sector junction and between sections.' },
  { id: 'manica.vomitory', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'A vomitory opening (default 2.8 m including walls) sits at the centre of every n-th section. Seats are removed from its mouth row back until the treads are 2.7 m above the tunnel floor (2.4 m headroom plus 300 mm structure). The floor is taken level with the tread in front of the mouth; a ramped floor would lose fewer rows.' },
  { id: 'manica.wheelchair', topic: 'Accessibility', kind: 'assumption', verification: 'recall', source: 'Manica default, after FIFA §2.3',
    statement: 'Each wheelchair position with its companion seat takes ⌈1400 mm ÷ seat width⌉ seats across the platform row, plus the seats behind it (1.4 m platform depth). Positions sit at the aisle ends of a section. Wheelchair users\' eye height is taken as 1150 mm; the platform is raised by the difference to the seated eye height (50 mm by default) so the position keeps the row\'s C-value. Sightlines over standing spectators in front are not checked yet.' },
  { id: 'manica.premium', topic: 'Premium', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'A premium level (suites or club) is inserted under an upper tier: it lifts that tier by its floor-to-floor height (default 4.5 m) and sets it back (default 4 m) so the tier can keep its C-values. Suite glass sits on the back of the tier below with a 1.8 m balcony in front and a 4 m corridor behind. Suites are 5.5 × 8 m with 16 seats by default; only whole suites are placed, 2 m clear of each end of a stand.' },
  { id: 'manica.program', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'Manica default; user-editable',
    statement: 'Concourse program is sized from area allowances per spectator served (defaults: toilets 0.07, concessions 0.06, retail 0.015, first aid 0.003 m², club lounge 1.0 m² per club seat). These are planning placeholders, not code values: toilet fixture counts, ratios and accessible provision come from the governing plumbing and building codes.' },
  { id: 'manica.cores', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'Vertical circulation cores (2 stairs of 2.4 m and 2 lifts by default, 9 × 11 m) stand outside the outermost floor plate every 60 m along the building. The distance to the nearest core is reported as a geometric indicator only; permitted travel distances, exit widths and egress time are set by the jurisdiction (review.egress).' },
  { id: 'manica.crossaisle', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'Manica default',
    statement: 'A lateral cross-aisle (default 1.5 m clear) widens the tread behind the seats of the row in front; the row behind is solved for its C-value over the wider gap. People walking in the aisle are not treated as an obstruction.' },
  { id: 'manica.stands', topic: 'Bowl plan', kind: 'assumption', verification: 'recall', source: 'Manica method',
    statement: 'Each tier keeps one row sequence all the way round, so corners meet the stands without steps. Stands can sit at their own distances and carry fewer or more rows; the riser solve uses the nearest stand that carries the tier, so farther stands are slightly steeper than they need to be.' },
  { id: 'manica.structure', topic: 'Structure', kind: 'assumption', verification: 'recall', source: 'Manica method; user-editable',
    statement: 'Radial structural frames are set out at the bay (default 10 m) along the outer column line, parallel on the straights and radial in the corners. Each tier gets a raker along its soffit on every frame (default 1.1 m deep) and columns on ring grid lines at the back of each tier, a mid support under each upper tier and the outer column line 1.5 m inside the facade. These are coordination geometry: member sizes, spans, transfer structure and bracing are not designed (review.structure).' },
  { id: 'manica.roof', topic: 'Roof', kind: 'assumption', verification: 'recall', source: 'Manica method; user-editable',
    statement: 'The roof bears on the outer column line. Its deck underside clears the highest tread by the set clearance (default 9 m) and rises toward the field at the set pitch; primary frames taper from the set depth to a quarter of it at the leading edge, above the deck on open roofs and below it on enclosed ones. Coverage counts seats inside the roof outline in plan (wind-driven rain is not modelled). The high-ball view is the height over the centre spot of the back-row sightline under the leading edge; the 20 m default is a Manica assumption, not a published standard. Long-span truss depth defaults to span / 12.' },
  { id: 'manica.sphere', topic: 'Spherical envelope', kind: 'assumption', verification: 'checked', checked: '2026-10-29', source: 'Manica method from the published Sphere (Las Vegas) figures: Populous, Severud Associates, Wikipedia', url: 'https://en.wikipedia.org/wiki/Sphere_(venue)',
    statement: 'The spherical envelope keeps the published proportions of the Sphere in Las Vegas: an Exosphere 516 ft (157 m) wide and 366 ft (112 m) tall on a steel diagrid carrying LED pucks at 8 in (203 mm) centres, and an interior dome whose LED media plane rises 240 ft (73 m) above the event floor on a 400 ft (122 m) diameter. Both are scaled to the smallest size that clears the bowl (by the roof clearance) and the building. The media plane is a cap of the dome aimed at the stage, sized to the published share of 160,000 ft² (15,000 m²) and reaching the floor behind the stage. The dome springs from the concourse roof (the tension ring) and closes on a compression ring, on 32 radial trusses. A conceptual massing, not an engineered shell.' },
  { id: 'manica.boh', topic: 'Back of house', kind: 'assumption', verification: 'recall', source: 'Manica default; user-editable',
    statement: 'Back-of-house rooms line a service corridor (default 6 m) at event level, in a band (default 16 m) starting under the lower tier where its soffit clears the rooms. Areas are Manica placeholders: team locker rooms 900 m² (soccer) or 1,800 m² (NFL) for two teams, officials 120 m², medical 150 m² + 0.002 m² per seat, press and broadcast 300 m² + 0.008, kitchens 0.02, storage 0.02, loading dock 1,200 m², waste 200 m² + 0.003, groundskeeping 500 m², event operations 250 m² + 0.002, all scaled by the allowance. Operators, leagues and broadcasters set the real brief.' },
  { id: 'manica.lighting', topic: 'Field lighting', kind: 'assumption', verification: 'recall', source: 'Manica method (lumen method); user-editable',
    statement: 'The fixture count comes from the lumen method, N = E × A / (Φ × MF × UF), with A the playing area plus run-off, the target average horizontal illuminance E (default 3,000 lx), a generic fixture of Φ lumens (default 180,000 lm, 1,500 W: a placeholder, not a product), maintenance factor 0.8 and utilisation factor 0.55. Fixtures hang from a catwalk 1.5 m inside and 1.5 m under the roof edge when the roof rings the field (more on the sides than the ends), otherwise from four corner masts 8 m beyond the facade. This is a count and power estimate, not a lighting design: uniformity, vertical illuminance to cameras, glare ratings and flicker need a point-by-point calculation with real photometry.' },
  { id: 'fifa.lighting', topic: 'Field lighting', kind: 'guidance', verification: 'recall', source: 'FIFA Stadium Lighting Guide (recall)',
    statement: 'To limit glare for players, the lowest luminaires should be at least 25° above the horizontal seen from the centre of the field, and luminaires should not be aimed more than about 70° from the vertical. Broadcast classes set vertical illuminance toward the cameras as well as horizontal levels. Verify the current edition and the competition (FIFA, UEFA, NFL broadcast) requirements before relying on these.' },
  { id: 'manica.boards', topic: 'Video boards', kind: 'assumption', verification: 'recall', source: 'Manica default; user-editable',
    statement: 'End video boards (default 36 × 13 m) stand 1 m behind the back row of each end stand with their underside 3 m above its last tread, and are checked against the roof underside. A centre-hung board hangs from a fixed roof over the field (default underside 30 m) and is checked against the clear height and the high-ball view. LED ribbons (0.9 m) run along the fascia of every upper tier. Sizes are placeholders, not products; screen resolution and readability are not checked.' },
  { id: 'manica.broadcast', topic: 'Broadcast', kind: 'assumption', verification: 'recall', source: 'Manica default; user-editable',
    statement: 'The main camera gantry sits on the main stand at halfway, at the front of the first upper tier (or behind the lower tier when there is none), with cameras on the 16 m (soccer) or 20-yard (NFL) lines and high cameras behind both goals. The press tribune takes the first two rows beside the main camera at 1.8 m per pair of commentary positions; its seats are counted but stay in the capacity. The outside-broadcast compound (default 2,500 m²) sits outside the main stand. Broadcasters set the real camera plan.' },
  { id: 'manica.mep', topic: 'MEP', kind: 'assumption', verification: 'recall', source: 'Manica planning ratios; user-editable',
    statement: 'Space reservations, not engineered systems. Conditioned area is the GFA plus half the bowl plan under an enclosed roof. Central plant 3.5% of it; demand 60 W/m² of it plus floodlights and boards (0.3 kW per m² of screen); transformers counted at 2.5 MVA (power factor 0.9), generators at 2 MW for 30% of demand; switchgear 100 m² + 0.0035 m² per spectator + 15 m² per transformer; transformer yard 100 + 60 m² each; generator yard 80 + 50 m² each; water storage and fire pumps 150 m² + 0.004 per spectator; telecom head end 80 m² + 0.0015 per spectator, all scaled by the allowance. Each core gets duct, electrical and plumbing risers and, on every level, an air-handling room and an electrical and telecom room. Duct zones (default 0.9 m) sit under each concourse ceiling. One Wi-Fi access point per 75 spectators. MEP engineers size the real systems.' },
  // ── design studies (Round 07)
  { id: 'manica.quality', topic: 'View quality', kind: 'assumption', verification: 'recall', source: 'Manica method',
    statement: 'Seat view quality = 0.5 × distance + 0.3 × sightline + 0.2 × head turn, each 0–1: distance scores 1 at or under 100 m from the eye to the farthest field corner and 0 at 190 m (the FIFA maximum, recall); sightline is the seat C-value over its tier target; head turn scores 1 facing the centre spot and 0 at 90°. A seat at 0.7 or more counts as good. Weights and thresholds are Manica choices for comparing options, not a published index; the roof, screens, obstruction by the tier above and atmosphere are not scored.' },
  { id: 'greenguide.egress', topic: 'Egress', kind: 'guidance', verification: 'recall', source: 'SGSA Green Guide (6th ed., 2018) — UK (recall)',
    statement: 'Rates of passage of about 79 persons per metre width per minute on stepped routes (and 109 on level routes) are used to size exits; the time allowed for spectators to leave the viewing area (egress time) is set by the ground\'s fire risk, typically between 2.5 and 8 minutes, and travel within the seating to a vomitory or exit is limited (Manica default 30 m). Values from recall: verify the current edition and the local code (US: NFPA 101 / IBC assembly occupancy).' },
  { id: 'manica.egress', topic: 'Egress', kind: 'assumption', verification: 'recall', source: 'Manica method; user-editable',
    statement: 'Each seat in use takes the shortest route to an exit of its tier: along its row, then up or down a stepped aisle (measured on the slope) to a vomitory mouth, or to the back of a tier without vomitories. An exit clears its seats in seats / (clear width × stepped rate of passage) minutes; the bowl reports its slowest exit. This is the seating stage only: concourses, stairs, gates, places of safety, queuing and evacuation of people with reduced mobility are not modelled (review.egress).' },
  { id: 'manica.sun', topic: 'Sun and shade', kind: 'assumption', verification: 'recall', source: 'Manica method; user-editable',
    statement: 'Sun position from the declination and hour-angle approximation (about ±1°) in local solar time at the site latitude (default 40° N when the site has none); pitch orientation from site north. Shadows are cast by a massing of the terraces, the building behind the bowl, the facade, the roof deck, the field cap and retractable panels. Roof coverings transmit a share of direct sun: metal 0, PTFE 0.10, ETFE 0.85 (typical values, recall; products vary). Frames, trusses, boards and the catwalk are ignored, and there is no diffuse or reflected light: these are direct-sun hours, not a daylight or turf-growth simulation.' },
  { id: 'manica.carbon', topic: 'Embodied carbon', kind: 'assumption', verification: 'recall', source: 'Manica method; generic factors recalled from the ICE database v3.0 (University of Bath / Circular Ecology, 2019); user-editable',
    statement: 'Cradle-to-gate (A1–A3) embodied carbon of the structure, roof and facade from the element model: reinforced concrete at 330 kgCO₂e/m³ plus 120 kg/m³ of reinforcement at 1.99 kgCO₂e/kg; structural steel at 1.55 kgCO₂e/kg; precast terraces as 250 mm of concrete over the seating plan; steel rakers and columns as 5 % of their modelled envelope; roof steel at 100 kg/m² of roof plan; roof covering 40 and facade 120 kgCO₂e/m². Shown with a ±30 % range. Foundations, substructure, cores, MEP, fit-out and modules A4–D are left out. Generic averages for comparing options, not product EPDs and not a life-cycle assessment (review.carbon).' },
  { id: 'manica.revenue', topic: 'Revenue', kind: 'assumption', verification: 'recall', source: 'Manica placeholders; user-editable',
    statement: 'Annual revenue = general seats × average ticket × occupancy × events + club seats × club price × occupancy × events + suites × annual licence. Default prices (60 and 250 per event, 150,000 per suite a year, 25 events, 85 % occupancy) are placeholders with no market basis; the low and high scenarios scale premium prices by 0.75 and 1.25. Not a business case.' },
  { id: 'manica.explore', topic: 'Optimisation', kind: 'assumption', verification: 'recall', source: 'Manica method',
    statement: 'The explorer varies the sideline and end distances (never inside the run-off), the corner radius and each tier\'s rows, regenerates every candidate for real, and keeps the designs that meet the minimum C-value and tier headroom. It reports the Pareto front of capacity against mean distance to the centre spot and recommends the closest-in design that reaches the target. It is a seeded search over a limited set of variables, not a proof of optimality; building, roof and cost are not part of the search.' },
  { id: 'review.carbon', topic: 'Embodied carbon', kind: 'engineer-review', verification: 'recall', source: 'Manica scope',
    statement: 'Carbon and material figures are order-of-magnitude comparisons. A whole-life carbon assessment (EN 15978 / RICS) by a qualified assessor with real quantities and EPDs is needed before any target or claim.' },
  // ── conceptual systems
  { id: 'review.structure', topic: 'Structure', kind: 'engineer-review', verification: 'recall', source: 'Manica scope',
    statement: 'Tier soffits, overhangs and tier gaps are architectural envelopes, not structural designs. Raker spans, cantilevers and vibration need a structural engineer.' },
  { id: 'review.egress', topic: 'Egress', kind: 'engineer-review', verification: 'recall', source: 'Manica scope',
    statement: 'Aisle spacing and seat counts are geometric checks only. Egress capacity, travel distance and exit width need jurisdiction-specific code analysis.' },
];

export const RULE = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<string, Rule>;
