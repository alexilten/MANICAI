# Architecture

## Principles

1. **One source of truth.** The `Project` (`src/core/schema.ts`) is a small, versioned JSON object of design intent. Everything else (geometry, seats, metrics, warnings, exports) is derived from it, and nothing derived is stored in it.
2. **The engine is pure TypeScript with no three.js.** `src/core` runs the same in the browser, in Node tests and in scripts, so every number on screen is testable.
3. **Exact before pretty.** The plan ring and the tier profiles are exact analytic objects (offset curves and stepped sections). Meshes, Rhino surfaces and seat positions are all cut from them, so the viewport, the `.3dm` and the metrics agree by construction.
4. **Millimetres, field-centred, Z up.** The engine works in mm with the origin at the field centre and Z up. The viewport wraps this in one Y-up metres group (rotate −90° about X, scale 0.001), the same convention as Stagework. North never moves geometry.

## Pipeline

```
Project ──► field ──► layout ──► plan ring ──► tier profiles ──► seats ──► analysis ──► building
 (JSON)     sports/    layout.ts   plan.ts      profile.ts        seats.ts    stadium.ts    building.ts
                                                                    │
                       viewport (three.js) ◄─────────────── Stadium ─┤
                       Rhino .3dm / CSV    ◄───────────────────────────┘
```

| Stage | What it produces | Notes |
|---|---|---|
| field (`core/sports`) | Boundary, surface, markings, zones, goals, landmarks | IFAB Law 1 and NFL Rule 1 geometry, each mark named |
| layout (`engine/layout.ts`) | Distance of each stand and rows of each tier in each of the 8 regions | Stands take their override or the tier's rows (0 if open). Corners follow the smaller neighbour. A tier can only run past its own row count where no tier sits above it there; other overrides are clamped and reported |
| plan (`engine/plan.ts`) | `PlanRing`: rounded rectangle `hx, hy, r`, offset by `cx, cy` when opposite stands sit at different distances | Rows are exact offsets d of this line. `planOffset` is its signed distance field. Eight segments (E, NE, N, …) map to sectors |
| profiles (`engine/profile.ts`) | Per tier: rows (nosing d, tread z, riser, eye, C on the side, end and corner), outline, rake | One row sequence per tier all the way round, so stands and corners meet without steps. Risers are solved from the C-value formula against the nearest region that carries the row, rounded up to the riser step and capped at the maximum rake. Cross-aisles widen the tread behind a row and the next riser is solved over the wider gap |
| seats (`engine/seats.ts`) | Columnar typed arrays (x, y, z, rotation, tier, sector, section, row, number, class, C, distances) | Sections are split by radial aisles at segment junctions and evenly between them (28 seats or fewer). Per-seat C uses the true plan sightline to the nearest boundary point (bisection on the SDF). Every gross position stays in the table with a status (active, vomitory, platform, sightline) and a class (general, premium, wheelchair, companion), so net capacity, the viewport and the exports agree |
| building (`engine/building.ts`) | Levels (concourses and premium plates), suites, program zones, cores, building metrics | Set out in the same (segment, u, d) frame as the seats, so it follows the bowl. Premium levels are part of the section: `solveProfiles` lifts and sets back the tier above them. `bandSolid` turns any band of the ring into a closed solid for the viewport and the .3dm |
| analysis (`engine/stadium.ts`) | Metrics (net, gross, exclusions, by tier, sector, stand and class, ADA count) and warnings | Each warning cites a rule id from the standards registry |

Each stage is memoised on a JSON key of its inputs (`stage()` in `stadium.ts`), so moving a seat-width slider skips field, plan and profiles.

## Data model highlights

- `TierParams.elevation` is the first tread level for tier 1, and the vertical gap above the tier below for upper tiers. `overhang` is how far the tier's front sits forward of the back of the tier below (negative is a setback).
- `targetC` per tier lets upper tiers accept less than the lower bowl.
- `bowl.stands` holds per-stand and per-corner overrides (distance, open, rows per tier). Anything left out follows the bowl-wide value.
- Schema v3 (Round 03) adds `premium` (levels inserted under a tier) and `building` (concourse, program allowances, cores). v2 files open with no premium levels and keep their capacities (tested).
- Schema v2 (Round 02) adds stands, tier kind, seat width, cross-aisles, vomitories and accessible positions. v1 files open with none of these, so they keep their Round 01 seat counts.
- `optimize.ts` evaluates capacity without storing a seat table, so "fit rows" and "suggest moves" can try dozens of candidate projects.
- Seat ids are `T{tier}-{section}-R{row}-S{seat}`, stable for a given project.
- `parseProject` refuses foreign schemas and newer versions, and fills missing groups from defaults so older drafts open.

## CAD / BIM strategy

| Format | Round | Approach |
|---|---|---|
| **Rhino .3dm** (7 and 8) | R01 ✓ | Written with rhino3dm (openNURBS in WASM) in the browser. Exact NURBS terraces: straight runs are extrusions of the tier section and corners are revolves. rhino3dm cannot cap or join these, so each tier's pieces are grouped `TERRACE_<id>` and `manicai_join_tiers.py` joins them in Rhino. Seats are one block definition per seat width with one instance per seat in use, named by seat id, with the C-value as a user string. Club seats go under 05_PREMIUM, wheelchair positions (their own 1400 × 900 block) and companions under 04_ACCESSIBILITY, vomitories as closed solids under 07_VERTICAL_CIRCULATION, and excluded positions as points with their reason under 91_ANALYSIS. The layer tree runs from 00_REFERENCE to 17_SITE, plus 90_DIMENSIONS and 91_ANALYSIS. The project JSON is embedded in document strings so the file reopens in MANICAI. |
| CSV seat schedule | R01 ✓ | One row per seat |
| GLB | R06 | three.js GLTFExporter from the viewport meshes, for visualisation |
| IFC | R06 | IfcOpenShell (WASM) or a server step. Map tiers to `IfcSlab` and stairs, seats to `IfcFurniture` with Psets. Needs a structural model first |
| DWG/DXF | R06 | Plan, section and seat-count drawings from the same annotations as Technical mode |
| Grasshopper | later | Publish the engine as a definition or plugin so a ring and profile can be driven from GH |

## Performance

The engine regenerates 75,000–100,000 seats in about 50–70 ms in Node (see [TESTS.md](TESTS.md)). The viewport draws all seats as a single `InstancedMesh` with per-instance colour. Seats are rebuilt only when the seat table changes.

### Risks and mitigations

| Risk | Status | Mitigation |
|---|---|---|
| Seat generation blocking the UI on big bowls | ~65 ms at 100k seats with R02 exclusions | Move `generateSeats` to a Web Worker if it passes ~100 ms |
| `.3dm` size (≈ 0.75 KB per seat instance) | 31 MB for 42k seats | Offer "seats as points" and "one block per section" options. Bowl-only export is already available |
| rhino3dm WASM heap on large files | Handles freed explicitly (`inspect3dm`) | Stream sections, and keep re-reading files in tests |
| Software WebGL (no GPU) is slow | Screenshots take about 40 s per frame under SwiftShader | Expected. Real GPUs render at interactive rates. Add a reduced-seat preview when FPS drops |
| Upper-tier C-values against the 34° rake cap | Flagged per row | Per-tier targets; "Suggest moves" tries rows, distances, corners and seat module and flags C, rake and headroom breaks |
| Corner geometry with large radii | `plan.corner` warning | Corners can now carry their own rows or be opened; corner tiers that fold back are still to come |

## Relationship to Stagework

Stagework was read (never written to) to reuse its proven stack: Vite, React 19, react-three-fiber, drei, postprocessing, zustand and rhino3dm, along with its unit helpers, its glass UI style and its GitHub Pages workflow. MANICAI is a separate repository. No Stagework code paths, data, secrets or history were carried over.
