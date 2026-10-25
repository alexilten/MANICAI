/**
 * Precedent library — the research the presets are built from.
 *
 * Facts are tagged by how they were established (see `Fact.v`):
 *   checked  — read in a cited source during research on `CHECKED` (URL in `sources`)
 *   recall   — reference knowledge not re-read this round; verify before publication
 *   inferred — MANICAI's own reading of public images/descriptions; not a published number
 *
 * Status is as of CHECKED. Proposals are never presented as completed buildings, and
 * collaborations name every studio we found credited.
 *
 * MANICAI is an independent experimental product. It is not affiliated with or endorsed by
 * MANICA Architecture or any studio listed here, and it holds none of their drawings or CAD.
 */
export const CHECKED = '2026-10-25';

export type Status = 'completed' | 'renovation-completed' | 'under-construction' | 'in-design' | 'proposal' | 'unbuilt' | 'competition-win-unbuilt';
export interface Fact<T = string | number> { value: T; v: 'checked' | 'recall' | 'inferred'; note?: string }
export interface Precedent {
  id: string;
  name: string;
  firm: 'MANICA' | 'Populous' | 'HOK' | 'ROSSETTI' | 'Other';
  typology: 'stadium' | 'arena' | 'ballpark' | 'mixed';
  sport: string;
  location: string;
  status: Fact<Status>;
  year?: Fact<string>;
  credits: Fact<string>;
  capacity?: Fact<number>;
  roof?: Fact<string>;
  bowl?: Fact<string>;
  features?: string[];
  sources: string[];
}

export const PRECEDENTS: Precedent[] = [
  // ── MANICA stadium portfolio (the brief's inventory) ──────────────────────────────────────────────
  {
    id: 'kc-chiefs', name: 'Kansas City Chiefs Stadium', firm: 'MANICA', typology: 'stadium', sport: 'NFL', location: 'Wyandotte County, Kansas, USA',
    status: { value: 'in-design', v: 'checked', note: 'Renderings released 22 Jul 2026; opening targeted for the 2031 NFL season' },
    year: { value: '2031 (target)', v: 'checked' },
    credits: { value: 'MANICA lead design architect; HNTB architect of record; CAA ICON owner\'s rep. MANICA and Populous were the two finalists (27 Jan 2026).', v: 'checked' },
    capacity: { value: 70000, v: 'checked', note: '"about 70,000"' },
    roof: { value: 'Fixed, fully enclosed; translucent ETFE (> 400,000 ft² of panels over the field)', v: 'checked' },
    bowl: { value: 'Bowl described as recalling Arrowhead, shaped (with the roof) to amplify crowd noise; Drum Deck and Ring of Honor above the bowl', v: 'checked' },
    sources: ['https://www.chiefs.com/news/chiefs-announce-two-world-renowed-kansas-city-area-firms-as-finalists-for-lead-designer-of-new-stadium', 'https://www.kctv5.com/2026/07/22/espn-insider-drops-first-look-chiefs-new-3-billion-kansas-stadium/'],
  },
  {
    id: 'birmingham-city', name: 'Birmingham City Football Club Stadium (Powerhouse Stadium)', firm: 'MANICA', typology: 'stadium', sport: 'Football (soccer), concerts', location: 'Birmingham Sports Quarter, England',
    status: { value: 'in-design', v: 'checked', note: 'Design unveiled Nov 2025' },
    credits: { value: 'Heatherwick Studio lead designer; MANICA collaborating architect (with Steven Knight).', v: 'checked' },
    capacity: { value: 62000, v: 'checked' },
    roof: { value: 'Steel roof hung from 12 brick "chimneys" (which hold lifts and stairs); shown as retractable', v: 'checked' },
    bowl: { value: '"Traditional seating bowl"; movable pitch', v: 'checked' },
    sources: ['https://www.dezeen.com/2025/11/20/birmingham-city-football-club-stadium-heatherwick-studio-manica/', 'https://heatherwick.com/project/birmingham-city-powerhouse-stadium/'],
  },
  {
    id: 'chicago-bears', name: 'New Chicago Bears Stadium', firm: 'MANICA', typology: 'stadium', sport: 'NFL', location: 'Arlington Heights, Illinois, USA',
    status: { value: 'proposal', v: 'checked', note: 'Sep 2025: renderings by MANICA; pending Illinois approval and financing. Re-check current status before use.' },
    year: { value: 'Before 2028 season (team target)', v: 'checked' },
    credits: { value: 'MANICA produced the first visualisations / helps design (NBC Chicago: "Bears hire Manica").', v: 'checked' },
    capacity: { value: 70000, v: 'checked' },
    roof: { value: 'Fully enclosed', v: 'checked' },
    sources: ['https://stadiumdb.com/news/2025/09/usa_chicago_bears_unveil_rendering_of_new_stadium_in_arlington_heights', 'https://www.nbcchicago.com/news/sports/chicago-football/bears-hire-manica-architecture-to-help-design-arlington-heights-stadium/2785271/'],
  },
  {
    id: 'new-nissan', name: 'New Nissan Stadium', firm: 'MANICA', typology: 'stadium', sport: 'NFL (Tennessee Titans)', location: 'Nashville, Tennessee, USA',
    status: { value: 'under-construction', v: 'checked', note: 'Groundbreaking 29 Feb 2024; opening planned 2027; Super Bowl LXIV (2030) awarded' },
    year: { value: '2027 (planned)', v: 'checked' },
    credits: { value: 'MANICA designer; Walter P Moore structural engineer; Tennessee Builders Alliance (AECOM Hunt, Turner, I.C.F., Polk) contractor. TVS Design also lists the project.', v: 'checked' },
    capacity: { value: 60000, v: 'checked', note: '55,000–60,000 in the proposal' },
    roof: { value: 'Enclosed, translucent ETFE', v: 'checked' },
    bowl: { value: '~170 luxury suites; ~1.7 million ft²', v: 'checked' },
    sources: ['https://en.wikipedia.org/wiki/Nissan_Stadium_(2027)', 'https://www.tvsdesign.com/projects/project-detail/new-nissan-stadium/'],
  },
  {
    id: 'allegiant', name: 'Allegiant Stadium', firm: 'MANICA', typology: 'stadium', sport: 'NFL (Raiders), college football, soccer, concerts', location: 'Paradise (Las Vegas), Nevada, USA',
    status: { value: 'completed', v: 'checked', note: 'Substantial completion 31 Jul 2020; first event 21 Sep 2020' },
    year: { value: '2020', v: 'checked' },
    credits: { value: 'MANICA design architect (design carried over from the unbuilt Carson proposal); HNTB architect. Mortenson–McCarthy contractor.', v: 'checked' },
    capacity: { value: 65000, v: 'checked', note: 'Expandable to 71,835; 61,000 for soccer' },
    roof: { value: 'Fixed translucent ETFE roof, climate controlled', v: 'checked' },
    bowl: { value: 'Ten-level building; 128 suites; roll-in natural-grass tray plus a separate synthetic field', v: 'checked' },
    sources: ['https://en.wikipedia.org/wiki/Allegiant_Stadium', 'https://www.hntb.com/projects/allegiant-stadium/'],
  },
  {
    id: 'miami-freedom-park', name: 'Inter Miami Freedom Park Stadium', firm: 'MANICA', typology: 'stadium', sport: 'MLS soccer', location: 'Miami, Florida, USA',
    status: { value: 'completed', v: 'checked', note: 'Inaugural match 4 Apr 2026' },
    year: { value: '2026', v: 'checked' },
    credits: { value: 'MANICA stadium architect; parkland by Arquitectonica (Dezeen).', v: 'checked' },
    capacity: { value: 25000, v: 'checked', note: 'Dezeen: 25,000; Wikipedia: 26,700 — sources differ' },
    bowl: { value: 'Lower and upper bowl (blocks 117–121 lower, 217–223 upper in the east "Leo Messi Stand")', v: 'checked' },
    sources: ['https://www.dezeen.com/?p=2283744', 'https://en.wikipedia.org/wiki/Miami_Freedom_Park'],
  },
  {
    id: 'progressive-field', name: 'Progressive Field Reimagined', firm: 'MANICA', typology: 'ballpark', sport: 'MLB (Cleveland Guardians)', location: 'Cleveland, Ohio, USA',
    status: { value: 'renovation-completed', v: 'checked', note: 'Phased: 2024 and 2025 Opening Days' },
    year: { value: '2024–2025', v: 'checked' },
    credits: { value: 'MANICA lead design architect; Moody Nolan architect of record; Mortenson national CM with Independence Construction. Original 1994 ballpark not by MANICA.', v: 'checked' },
    bowl: { value: 'Upper Deck reworked (beer garden, group space, View Box bars), terraced 200/300-level club seating, new Dugout Club, E. 9th St building in right field', v: 'checked' },
    features: ['Asymmetric ballpark bowl — needs MANICAI\'s future baseball system (not a rectangle).'],
    sources: ['https://www.mlb.com/press-release/press-release-guardians-announce-progressive-field-reimagined'],
  },
  {
    id: 'milano', name: 'Nuovo Stadio Milano', firm: 'MANICA', typology: 'stadium', sport: 'Football (AC Milan, Inter)', location: 'San Siro, Milan, Italy',
    status: { value: 'in-design', v: 'checked', note: 'Renderings to be presented 29 Oct 2026; authorisation expected 2027; target summer 2031 (Euro 2032)' },
    credits: { value: 'Foster + Partners and MANICA (appointed 23 Sep 2025). Earlier (2019) MANICA + CMR Sportium entry "Gli Anelli di Milano" lost to Populous\' "Cathedral".', v: 'checked' },
    capacity: { value: 71500, v: 'checked', note: '> 13,000 premium seats' },
    roof: { value: 'Fixed roof over the stands, pitch open', v: 'checked' },
    bowl: { value: 'Two large tiers, more oval than the Meazza; curve sections up to ~37°; ~52 m tall (preliminary, per press)', v: 'checked' },
    sources: ['https://www.acmilan.com/it/news/articoli/club/2025-09-23/ac-milan-e-fc-internazionale-milano-annunciano-la-collaborazione-con-foster-partners-e-manica-per-il-nuovo-stadio-di-milano', 'https://www.tuttomercatoweb.com/serie-a/29-ottobre-inter-milan-presentano-rendering-stadio-sappiamo-2285642', 'https://www.calcioefinanza.it/2025/09/23/chi-e-david-manica-architetto-san-siro-progetto-disegno/'],
  },
  {
    id: 'camp-nou', name: 'New Camp Nou (Spotify Camp Nou)', firm: 'MANICA', typology: 'stadium', sport: 'Football (FC Barcelona)', location: 'Barcelona, Spain',
    status: { value: 'under-construction', v: 'recall', note: 'Phased reopening from Nov 2025 while works continue — verify current phase' },
    credits: { value: 'Architects Nikken Sekkei with Pascual i Ausió Arquitectes (2016 competition). MANICA joined in Oct 2016 providing "technical sport design services". Not a MANICA-led design.', v: 'checked' },
    capacity: { value: 105000, v: 'recall', note: 'Planned ~105,000 on completion' },
    bowl: { value: 'Three tiers, existing bowl rebuilt and extended; new roof', v: 'recall' },
    sources: ['https://sportsvenuebusiness.com/2016/10/20/manica-architecture-joins-new-camp-nou-stadium-design-team/'],
  },
  {
    id: 'cagliari', name: 'Cagliari Calcio Stadium (New Sant\'Elia)', firm: 'MANICA', typology: 'stadium', sport: 'Football', location: 'Cagliari, Italy',
    status: { value: 'competition-win-unbuilt', v: 'checked', note: 'Sportium consortium won May 2018; "in development" (2025 press) — not built' },
    credits: { value: 'Sportium consortium: Progetto CMR, iDeas, B&L Real Estate, MANICA.', v: 'checked' },
    capacity: { value: 21000, v: 'checked', note: '2018 figure; later press cites ~25,000 — verify' },
    sources: ['https://sportsvenuebusiness.com/?p=8302'],
  },
  {
    id: 'lockhart', name: 'Inter Miami CF Stadium at Lockhart (formerly DRV PNK / Chase Stadium)', firm: 'MANICA', typology: 'stadium', sport: 'MLS soccer (interim)', location: 'Fort Lauderdale, Florida, USA',
    status: { value: 'completed', v: 'checked', note: 'Opened 2020 as an interim venue; first-team MLS games moved to Freedom Park in 2026' },
    year: { value: '2020', v: 'checked' },
    credits: { value: 'Listed as MANICA-designed (Wikipedia, MANICA Architecture article). Two later expansions (bleacher corners 2023, boxes 2024).', v: 'checked' },
    capacity: { value: 21550, v: 'checked', note: 'After the Jan 2024 expansion; ~18,000 at opening' },
    sources: ['https://en.wikipedia.org/wiki/Chase_Stadium', 'https://en.wikipedia.org/wiki/Manica_Architecture'],
  },
  {
    id: 'vtb-arena-park', name: 'VTB Arena Park / Dynamo Central Stadium', firm: 'MANICA', typology: 'mixed', sport: 'Football + ice hockey', location: 'Moscow, Russia',
    status: { value: 'completed', v: 'checked', note: 'Completed 2019 (ENR Best Project 2020)' },
    credits: { value: 'MANICA lead design firm; Rizzani de Eccher general contractor.', v: 'checked' },
    capacity: { value: 26000, v: 'checked', note: 'Stadium 26,000 + indoor arena 14,000' },
    roof: { value: '22,000 m² polycarbonate-panel roof on a thin steel frame', v: 'checked' },
    bowl: { value: 'An arena nested inside the stadium ("matryoshka"); both venues 8 m above a retail plaza; keeps the 1928 wall', v: 'checked' },
    sources: ['https://www.enr.com/articles/50100-best-project-sportsentertainment-vtb-arena---dynamo-central-stadium'],
  },
  {
    id: 'san-paolo', name: 'San Paolo Renovation Concept', firm: 'MANICA', typology: 'stadium', sport: 'Football (SSC Napoli)', location: 'Naples, Italy',
    status: { value: 'unbuilt', v: 'checked', note: 'Unrealised renovation proposal' },
    credits: { value: 'MANICA concept.', v: 'checked' },
    sources: ['https://www.calcioefinanza.it/2025/09/23/chi-e-david-manica-architetto-san-siro-progetto-disegno/'],
  },
  {
    id: 'tirana', name: 'Tirana National Stadium (competition design)', firm: 'MANICA', typology: 'stadium', sport: 'Football', location: 'Tirana, Albania',
    status: { value: 'competition-win-unbuilt', v: 'checked', note: 'MANICA + PCMR won the 2014 design-build competition; the stadium later built on the site (Air Albania, 2019) is credited to Archea Associati — verify the relationship' },
    credits: { value: 'MANICA with PCMR, exclusive architect to Serenissima Construction (2014).', v: 'checked' },
    capacity: { value: 22000, v: 'checked' },
    sources: ['https://www.stadiumbusinesssummit.com/?p=1928', 'https://domusweb.it/en/architecture/2019/11/25/the-new-italian-stadium-tells-a-lot-about-the-new-tirana.html'],
  },
  // ── MANICA arenas (platform should later support them; not in the stadium MVP)
  { id: 'chase-center', name: 'Chase Center', firm: 'MANICA', typology: 'arena', sport: 'NBA (Warriors), concerts', location: 'San Francisco, USA', status: { value: 'completed', v: 'recall' }, year: { value: '2019', v: 'recall' }, credits: { value: 'MANICA design architect (Wikipedia, MANICA Architecture).', v: 'checked' }, capacity: { value: 18064, v: 'recall' }, sources: ['https://en.wikipedia.org/wiki/Manica_Architecture'] },
  { id: 'okc-arena', name: 'Oklahoma City Arena (new Thunder arena)', firm: 'MANICA', typology: 'arena', sport: 'NBA', location: 'Oklahoma City, USA', status: { value: 'under-construction', v: 'recall' }, credits: { value: 'MANICA design (Wikipedia lists it under construction).', v: 'checked' }, sources: ['https://en.wikipedia.org/wiki/Manica_Architecture'] },
  { id: 'vtb-arena', name: 'VTB Arena (indoor)', firm: 'MANICA', typology: 'arena', sport: 'Ice hockey, basketball', location: 'Moscow, Russia', status: { value: 'completed', v: 'checked' }, credits: { value: 'MANICA (part of VTB Arena Park).', v: 'checked' }, capacity: { value: 14000, v: 'checked' }, sources: ['https://www.enr.com/articles/50100-best-project-sportsentertainment-vtb-arena---dynamo-central-stadium'] },
  { id: 'aichi-arena', name: 'Aichi Prefecture Arena', firm: 'MANICA', typology: 'arena', sport: 'Sumo, basketball, events', location: 'Nagoya, Japan', status: { value: 'completed', v: 'recall' }, credits: { value: 'Listed in the brief as MANICA portfolio; MANICA\'s role was not verified in this round.', v: 'recall' }, sources: [] },
  { id: 'osaka-arena', name: 'Osaka Arena', firm: 'MANICA', typology: 'arena', sport: 'Multipurpose', location: 'Osaka, Japan', status: { value: 'in-design', v: 'recall' }, credits: { value: 'Listed in the brief as MANICA portfolio; status and role not verified in this round.', v: 'recall' }, sources: [] },
  // ── Populous (HOK Sport until the 2009 management buyout and renaming)
  { id: 'tottenham', name: 'Tottenham Hotspur Stadium', firm: 'Populous', typology: 'stadium', sport: 'Football, NFL', location: 'London, England', status: { value: 'completed', v: 'checked' }, year: { value: '2019', v: 'recall' }, credits: { value: 'Populous.', v: 'checked' }, capacity: { value: 62850, v: 'recall' }, bowl: { value: 'Single-tier 17,500-seat South Stand; retractable grass pitch over an NFL synthetic field', v: 'recall' }, sources: ['https://populous.com/?p=38112'] },
  { id: 'wembley', name: 'Wembley Stadium', firm: 'Populous', typology: 'stadium', sport: 'Football, events', location: 'London, England', status: { value: 'completed', v: 'recall' }, year: { value: '2007', v: 'recall' }, credits: { value: 'Foster + Partners with HOK Sport (now Populous); David Manica was a lead designer while at HOK Sport.', v: 'checked' }, capacity: { value: 90000, v: 'recall' }, bowl: { value: 'Three tiers; partly retractable roof; 133 m arch', v: 'recall' }, sources: ['https://en.wikipedia.org/wiki/Manica_Architecture'] },
  { id: 'highmark', name: 'New Highmark Stadium', firm: 'Populous', typology: 'stadium', sport: 'NFL (Buffalo Bills)', location: 'Orchard Park, New York, USA', status: { value: 'under-construction', v: 'checked', note: 'Nearing completion for 2026' }, credits: { value: 'Populous.', v: 'checked' }, capacity: { value: 62000, v: 'checked' }, bowl: { value: 'Open-air bowl with canopy over most seats; tight sideline proximity', v: 'recall' }, sources: ['https://www.dezeen.com/?p=2283744'] },
  { id: 'yankee', name: 'Yankee Stadium', firm: 'Populous', typology: 'ballpark', sport: 'MLB', location: 'The Bronx, New York, USA', status: { value: 'completed', v: 'recall' }, year: { value: '2009', v: 'recall' }, credits: { value: 'HOK Sport (Populous from 2009). Historic HOK Sport credit — not the contemporary HOK.', v: 'recall' }, capacity: { value: 46537, v: 'recall' }, sources: [] },
  { id: 'everton', name: 'Hill Dickinson Stadium (Everton)', firm: 'Other', typology: 'stadium', sport: 'Football', location: 'Bramley-Moore Dock, Liverpool, England', status: { value: 'completed', v: 'checked' }, year: { value: '2025', v: 'checked' },
    credits: { value: 'Design architect Dan Meis (MEIS Architects, stages 1–3); delivery architect BDP Pattern; contractor Laing O\'Rourke. The brief lists it under Populous — we found no Populous credit.', v: 'checked' },
    capacity: { value: 52888, v: 'checked' }, bowl: { value: 'Single-tier South Stand at 33.89° maximum rake, "as steep as regulations allow"', v: 'checked' }, sources: ['https://www.ribaj.com/buildings/bramley-moore-dock-everton-meis-architects-bdp-pattern-liverpool-stadium/'] },
  // ── HOK (contemporary practice; ROSSETTI acquired 29 Apr 2026, operating as HOK + ROSSETTI)
  { id: 'mercedes-benz', name: 'Mercedes-Benz Stadium', firm: 'HOK', typology: 'stadium', sport: 'NFL, MLS', location: 'Atlanta, Georgia, USA', status: { value: 'completed', v: 'recall' }, year: { value: '2017', v: 'recall' }, credits: { value: 'HOK (with associate architects).', v: 'recall' }, capacity: { value: 71000, v: 'recall' }, roof: { value: 'Eight-petal retractable ETFE roof; 360° halo video board', v: 'recall' }, sources: [] },
  { id: 'hard-rock', name: 'Hard Rock Stadium modernization', firm: 'HOK', typology: 'stadium', sport: 'NFL', location: 'Miami Gardens, Florida, USA', status: { value: 'renovation-completed', v: 'recall' }, year: { value: '2015–2016', v: 'recall' }, credits: { value: 'HOK.', v: 'recall' }, roof: { value: 'New canopy shading the seating bowl', v: 'recall' }, sources: [] },
  { id: 'etihad-park', name: 'Etihad Park (NYCFC)', firm: 'HOK', typology: 'stadium', sport: 'MLS soccer', location: 'Willets Point, Queens, New York, USA', status: { value: 'under-construction', v: 'checked', note: 'Broke ground Dec 2024; opening July 2027' }, credits: { value: 'HOK.', v: 'checked' }, capacity: { value: 25000, v: 'recall' }, sources: ['https://www.hok.com/projects/view/new-york-city-football-clubs-etihad-park/', 'https://www.khaleejtimes.com/uae/etihad-park-nyc-football-club-open-july-2027'] },
  { id: 'everbank', name: 'EverBank Stadium modernization ("Stadium of the Future")', firm: 'HOK', typology: 'stadium', sport: 'NFL', location: 'Jacksonville, Florida, USA', status: { value: 'under-construction', v: 'recall' }, credits: { value: 'HOK.', v: 'recall' }, sources: [] },
  { id: 'ford-field', name: 'Ford Field', firm: 'ROSSETTI', typology: 'stadium', sport: 'NFL', location: 'Detroit, Michigan, USA', status: { value: 'completed', v: 'checked' }, year: { value: '2002', v: 'recall' }, credits: { value: 'ROSSETTI (now part of HOK).', v: 'checked' }, capacity: { value: 65000, v: 'recall' }, sources: ['https://www.athleticbusiness.com/industry-press-room/press-release/15823574/hok-hok-and-rossetti-join-forces-to-create-expanded-global-sports-recreation-and-entertainment-design-practice'] },
  { id: 'arthur-ashe', name: 'Arthur Ashe Stadium reimagination / USTA Billie Jean King NTC', firm: 'ROSSETTI', typology: 'stadium', sport: 'Tennis', location: 'Queens, New York, USA', status: { value: 'in-design', v: 'checked', note: '"Ongoing reimagination" (Apr 2026)' }, credits: { value: 'ROSSETTI.', v: 'checked' }, sources: ['https://www.athleticbusiness.com/industry-press-room/press-release/15823574/hok-hok-and-rossetti-join-forces-to-create-expanded-global-sports-recreation-and-entertainment-design-practice'] },
  { id: 'daytona', name: 'Daytona International Speedway — DAYTONA Rising', firm: 'ROSSETTI', typology: 'stadium', sport: 'Motorsport', location: 'Daytona Beach, Florida, USA', status: { value: 'renovation-completed', v: 'recall' }, year: { value: '2016', v: 'recall' }, credits: { value: 'ROSSETTI.', v: 'recall' }, sources: [] },
];

/** Benchmarks for the product landscape (described from public material only). */
export const TOOLS = [
  { id: 'hok-scrum', name: 'HOK Scrum', note: 'HOK\'s proprietary Grasshopper/Rhino seating-bowl tool (lead developer Carlos DelaBarrera). Public description: real-time 3D bowl, seat width, sightlines, proximity, rake, row elevation, concessions/restroom access, acoustics, event-specific scoring, seat-level revenue modelling, precast-length rationalisation (Roig Arena); integration with HOK STREAM for steel tonnage described as in progress. A bowl can be set up in a day; 2–3× faster. MANICAI has no access to its code or methods.', source: 'https://www.hok.com/ideas/research/hoks-scrum-a-game-changing-design-tool-for-sports-and-entertainment-venues/', checked: '2026-10-25' },
  { id: 'grasshopper', name: 'Rhino + Grasshopper (custom definitions)', note: 'The de-facto professional environment for parametric bowls; powerful but expert-only. MANICAI exports native .3dm so work continues there.', source: 'https://www.rhino3d.com/', checked: '2026-10-25' },
];
