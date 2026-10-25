# MANICAI

**A generative stadium design engine.** You set a sport, a field and a handful of bowl rules. MANICAI generates a continuous seating bowl with every seat placed, sightlines solved row by row, and live capacity. It exports a native Rhino model that an architect can keep working in.

> MANICAI is an independent experimental product. It is not an official product of MANICA Architecture and is not endorsed by MANICA or any studio named in this repository. Precedent presets are parametric studies built from public facts, not the architects' geometry.

![Generic soccer bowl, perspective](docs/screenshots/01-perspective.png)

## Status after Round 03

| Area | What works now |
|---|---|
| Sports | Soccer, built to IFAB Law 1 with FIFA 105 × 68 m defaults. NFL, built to Rule 1 (360 × 160 ft) with end zones, hash marks, numbers, goalposts and team areas. Baseball is shown but disabled. |
| Bowl | One continuous bowl. The first-row line is a rounded rectangle offset from the field with a corner radius from 0 (four separate stands). Each stand (N, S, E, W) can sit at its own distance, and each stand or corner can carry its own row count per tier or be left open (a horseshoe). |
| Tiers | One to three tiers, general or club. Each tier sets its rows, row depth, seat width, first-row elevation or gap above the tier below, overhang or setback, front barrier, C-value target, lateral cross-aisles, vomitories and wheelchair positions. |
| Sightlines | Risers are solved row by row to a target C-value (FIFA: 60, 90 or 120 mm), rounded to a riser step and capped at a maximum rake. A constant-riser mode is also available. Each seat's C-value is measured along its true plan sightline, so corners are checked obliquely. |
| Seats | Real seats are placed along every row. Radial aisles sit at each sector change and between sections, with at most 28 seats between aisles. Each seat has an id such as `T1-104-R12-S07`. |
| Building | Premium levels (suites or club) inserted under an upper tier lift and set it back, so the section and the upper tier's sightlines respond. Each tier gets a concourse at its access level (vomitory floor or back row) with concessions, toilets, retail, first aid and club lounges sized from per-spectator allowances. Stair and lift cores stand outside at a set spacing. Gross floor area, area per spectator and a live building section. |
| Capacity | Live net capacity (after vomitories, wheelchair platforms and optionally seats below the minimum C) and gross, by tier, sector, stand and class, with the ADA wheelchair count. "Fit rows to target" and "Suggest moves", which tries geometric changes and flags the rules each would break. |
| Analysis | Seats can be coloured by C-value, distance to the far corner (FIFA 150 m and 190 m), tier, sector or class (with excluded positions shown). A seat inspector and "view from this seat" are included. |
| Views | Perspective, plan, elevation, section with a live cut plane, iso and field level. Explore, Technical (with dimensions) and Analysis modes. |
| Files | Save and open `.manicai.json`. Export to Rhino 8 or 7 `.3dm` with or without seats (floor plates, suites, program zones and cores, vomitory solids, wheelchair and companion positions, club seats and excluded positions on their own layers), a seat schedule `.csv` with class and status, and a RhinoPython script that joins each tier and cuts its vomitories. A MANICAI `.3dm` can be reopened in MANICAI. |

What is **not** in yet: structure, roof, façade, loges and press boxes, and any egress calculation. See [ROADMAP.md](docs/ROADMAP.md).

### Round 02 views

| Horseshoe: east end open | Single-tier west end, plan (lower tier only, 1¾ deep) |
|---|---|
| ![Horseshoe](docs/screenshots/09-horseshoe-open-end.png) | ![Single-tier end, plan](docs/screenshots/10-single-tier-end.png) |
| **Analysis → Class:** wheelchair (blue), companion and excluded positions | **Vomitories** cut through the lower tier |
| ![Seat classes](docs/screenshots/11-analysis-class.png) | ![Vomitories](docs/screenshots/12-vomitories-iso.png) |

### Round 03 views

| NFL bowl with suites, concourses, program and cores | Building section (Technical, cut at the 50-yard line) |
|---|---|
| ![NFL building](docs/screenshots/13-nfl-building.png) | ![Section](docs/screenshots/14-building-section.png) |

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # acceptance tests A–W (61 tests)
npm run bench        # regeneration benchmarks at 25k, 50k, 75k and 100k seats
npm run build        # typecheck and production build
npm run export:samples && npm run verify:3dm   # needs: pip install rhino3dm
npm run docs         # regenerates STANDARDS, PRESETS and PRECEDENTS from the data
```

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Coordinates

The world origin `(0, 0, 0)` is the centre of the field at field level. **+X** runs along the field length, **+Y** across its width and **+Z** up. All units are millimetres, in the engine and in the `.3dm`. North is a site parameter (`site.northDeg`, the compass bearing of +X) and never moves geometry.

## Documents

- [RESEARCH.md](docs/RESEARCH.md): Round 00 research, covering MANICA, Populous, HOK and ROSSETTI, HOK Scrum, bowl principles and corrections to the brief.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): the engine pipeline, data model, CAD/BIM strategy, performance and risks.
- [STANDARDS.md](docs/STANDARDS.md): every rule applied, tagged governing, guidance, assumption or engineer-review, and checked or recall.
- [PRESETS.md](docs/PRESETS.md) and [PRECEDENTS.md](docs/PRECEDENTS.md): presets with what is published and what is assumed, plus the sourced precedent library.
- [ROADMAP.md](docs/ROADMAP.md): limitations and next rounds.
- [TESTS.md](docs/TESTS.md): acceptance tests A–W and benchmark results.

## Layout

```
src/core/          engine: sports, schema, plan, profiles, seats, stadium, optimize, presets, data
src/export/        Rhino .3dm writer and reader, CSV, browser download helpers, join script
src/viewport/      three.js / react-three-fiber scene
src/ui/            panels, toolbar, store (zustand)
tests/             vitest acceptance tests A–W (v1 and v2 fixtures in tests/fixtures)
scripts/           bench, sample export, Python .3dm verifier, docs generator
examples/          every preset as a .manicai.json
samples/           Rhino 8 samples, seat schedule and a read-back manifest
```
