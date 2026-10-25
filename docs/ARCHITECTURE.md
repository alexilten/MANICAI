# Architecture

## Principles

1. **One source of truth.** The `Project` (`src/core/schema.ts`) is a small, versioned JSON object of design intent. Everything else (geometry, seats, metrics, warnings, exports) is derived from it, and nothing derived is stored in it.
2. **The engine is pure TypeScript with no three.js.** `src/core` runs the same in the browser, in Node tests and in scripts, so every number on screen is testable.
3. **Exact before pretty.** The plan ring and the tier profiles are exact analytic objects (offset curves and stepped sections). Meshes, Rhino surfaces and seat positions are all cut from them, so the viewport, the `.3dm` and the metrics agree by construction.
4. **Millimetres, field-centred, Z up.** The engine works in mm with the origin at the field centre and Z up. The viewport wraps this in one Y-up metres group (rotate −90° about X, scale 0.001), the same convention as Stagework. North never moves geometry.

## Pipeline

```
Project ──► field ──► plan ring ──► tier profiles ──► seats ──► analysis
 (JSON)     sports/    plan.ts      profile.ts        seats.ts    stadium.ts
                                                                    │
                       viewport (three.js) ◄─────────────── Stadium ─┤
                       Rhino .3dm / CSV    ◄───────────────────────────┘
```

| Stage | What it produces | Notes |
|---|---|---|
| field (`core/sports`) | Boundary, surface, markings, zones, goals, landmarks | IFAB Law 1 and NFL Rule 1 geometry, each mark named |
| plan (`engine/plan.ts`) | `PlanRing`: rounded rectangle `hx, hy, r` at the first row | Rows are exact offsets d of this line. `planOffset` is its signed distance field. Eight segments (E, NE, N, …) map to sectors |
| profiles (`engine/profile.ts`) | Per tier: rows (nosing d, tread z, riser, eye, C on the side, end and corner), outline, rake | Risers solved from the C-value formula against the governing (nearest) of the side, end and corner distances, rounded up to the riser step and capped at the maximum rake |
| seats (`engine/seats.ts`) | Columnar typed arrays (x, y, z, rotation, tier, sector, section, row, number, class, C, distances) | Sections are split by radial aisles at segment junctions and evenly between them (28 seats or fewer). Per-seat C uses the true plan sightline to the nearest boundary point (bisection on the SDF) |
| analysis (`engine/stadium.ts`) | Metrics and warnings | Each warning cites a rule id from the standards registry |

Each stage is memoised on a JSON key of its inputs (`stage()` in `stadium.ts`), so moving a seat-width slider skips field, plan and profiles.

## Data model highlights

- `TierParams.elevation` is the first tread level for tier 1, and the vertical gap above the tier below for upper tiers. `overhang` is how far the tier's front sits forward of the back of the tier below (negative is a setback).
- `targetC` per tier lets upper tiers accept less than the lower bowl.
- Seat ids are `T{tier}-{section}-R{row}-S{seat}`, stable for a given project.
- `parseProject` refuses foreign schemas and newer versions, and fills missing groups from defaults so older drafts open.

## CAD / BIM strategy

| Format | Round | Approach |
|---|---|---|
| **Rhino .3dm** (7 and 8) | R01 ✓ | Written with rhino3dm (openNURBS in WASM) in the browser. Exact NURBS terraces: straight runs are extrusions of the tier section and corners are revolves. rhino3dm cannot cap or join these, so each tier's pieces are grouped `TERRACE_<id>` and `manicai_join_tiers.py` joins them in Rhino. Seats are one block definition with one instance per seat, named by seat id, with the C-value as a user string. The layer tree runs from 00_REFERENCE to 17_SITE, plus 90_DIMENSIONS and 91_ANALYSIS. The project JSON is embedded in document strings so the file reopens in MANICAI. |
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
| Seat generation blocking the UI on big bowls | ~50 ms at 100k seats today | Move `generateSeats` to a Web Worker if R02 exclusions push it past ~100 ms |
| `.3dm` size (≈ 0.75 KB per seat instance) | 31 MB for 42k seats | Offer "seats as points" and "one block per section" options. Bowl-only export is already available |
| rhino3dm WASM heap on large files | Handles freed explicitly (`inspect3dm`) | Stream sections, and keep re-reading files in tests |
| Software WebGL (no GPU) is slow | Screenshots take about 40 s per frame under SwiftShader | Expected. Real GPUs render at interactive rates. Add a reduced-seat preview when FPS drops |
| Upper-tier C-values against the 34° rake cap | Flagged per row | Per-tier targets; the R02 optimiser will trade gap, overhang and first-row distance |
| Corner geometry with large radii | `plan.corner` warning | R02: variable corner profiles (corner tiers that fold back) |

## Relationship to Stagework

Stagework was read (never written to) to reuse its proven stack: Vite, React 19, react-three-fiber, drei, postprocessing, zustand and rhino3dm, along with its unit helpers, its glass UI style and its GitHub Pages workflow. MANICAI is a separate repository. No Stagework code paths, data, secrets or history were carried over.
