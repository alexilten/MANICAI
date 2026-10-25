/**
 * Standards & constraints registry.
 *
 * Every number the engine uses that comes from outside MANICAI is listed here with its source,
 * so the UI and the exports can say where a value came from and how far to trust it.
 *
 *   kind
 *     governing        — a sport's own rules (field geometry). Binding for that competition.
 *     guidance         — published design guidance (FIFA, UEFA, SGSA Green Guide). Recommendations,
 *                        not building code; national regulations and the authority having jurisdiction decide.
 *     assumption       — a MANICAI planning default. Configurable; not from any code.
 *     engineer-review  — topics MANICAI represents only conceptually; needs qualified review.
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
  { id: 'manicai.nfl.teamarea', topic: 'NFL team area', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'Team areas drawn between the 32-yard lines, from the border to the 30 ft bench line. Verify the extent against the current NFL Rulebook and league operations requirements.' },
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
  // ── MANICAI planning assumptions
  { id: 'manicai.eye', topic: 'Sightlines', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'Seated eye point 1200 mm above the tread, 400 mm in front of the riser behind. Configurable.' },
  { id: 'manicai.riserstep', topic: 'Rake', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'Solved risers round up to 10 mm increments (precast-friendly). Configurable.' },
  { id: 'manicai.barrier', topic: 'Barriers', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'Front-of-tier barrier 800 mm above the first tread for the first-row sightline check (the Green Guide minimum in front of seated rows; 1100 mm where people can walk behind it). Barrier heights are set by local code and loading standards.' },
  { id: 'manicai.aisle', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'Radial aisles 1200 mm clear (FIFA minimum route width) at every sector junction and between sections.' },
  { id: 'manicai.vomitory', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'A vomitory opening (default 2.8 m including walls) sits at the centre of every n-th section. Seats are removed from its mouth row back until the treads are 2.7 m above the tunnel floor (2.4 m headroom plus 300 mm structure). The floor is taken level with the tread in front of the mouth; a ramped floor would lose fewer rows.' },
  { id: 'manicai.wheelchair', topic: 'Accessibility', kind: 'assumption', verification: 'recall', source: 'MANICAI default, after FIFA §2.3',
    statement: 'Each wheelchair position with its companion seat takes ⌈1400 mm ÷ seat width⌉ seats across the platform row, plus the seats behind it (1.4 m platform depth). Positions sit at the aisle ends of a section. Wheelchair users\' eye height is taken as 1150 mm; the platform is raised by the difference to the seated eye height (50 mm by default) so the position keeps the row\'s C-value. Sightlines over standing spectators in front are not checked yet.' },
  { id: 'manicai.crossaisle', topic: 'Circulation', kind: 'assumption', verification: 'recall', source: 'MANICAI default',
    statement: 'A lateral cross-aisle (default 1.5 m clear) widens the tread behind the seats of the row in front; the row behind is solved for its C-value over the wider gap. People walking in the aisle are not treated as an obstruction.' },
  { id: 'manicai.stands', topic: 'Bowl plan', kind: 'assumption', verification: 'recall', source: 'MANICAI method',
    statement: 'Each tier keeps one row sequence all the way round, so corners meet the stands without steps. Stands can sit at their own distances and carry fewer or more rows; the riser solve uses the nearest stand that carries the tier, so farther stands are slightly steeper than they need to be.' },
  // ── conceptual systems
  { id: 'review.structure', topic: 'Structure', kind: 'engineer-review', verification: 'recall', source: 'MANICAI scope',
    statement: 'Tier soffits, overhangs and tier gaps are architectural envelopes, not structural designs. Raker spans, cantilevers and vibration need a structural engineer.' },
  { id: 'review.egress', topic: 'Egress', kind: 'engineer-review', verification: 'recall', source: 'MANICAI scope',
    statement: 'Aisle spacing and seat counts are geometric checks only. Egress capacity, travel distance and exit width need jurisdiction-specific code analysis.' },
];

export const RULE = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<string, Rule>;
