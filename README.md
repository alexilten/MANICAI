# MANICAI

**A generative stadium design engine.** You set a sport, a field and a handful of bowl rules. MANICAI generates a continuous seating bowl with every seat placed, sightlines solved row by row, and live capacity. It exports a native Rhino model that an architect can keep working in.

> MANICAI is an independent experimental product. It is not an official product of MANICA Architecture and is not endorsed by MANICA or any studio named in this repository. Precedent presets are parametric studies built from public facts, not the architects' geometry.

![Generic soccer bowl, perspective](docs/screenshots/01-perspective.png)

## Round 01 status

| Area | What works now |
|---|---|
| Sports | Soccer, built to IFAB Law 1 with FIFA 105 × 68 m defaults. NFL, built to Rule 1 (360 × 160 ft) with end zones, hash marks, numbers, goalposts and team areas. Baseball is shown but disabled. |
| Bowl | One continuous bowl. The first-row line is a rounded rectangle offset from the field, with sideline and end distances and a corner radius from 0, which gives four separate stands. |
| Tiers | One to three tiers. Each tier sets its rows, row depth, first-row elevation or gap above the tier below, overhang or setback, front barrier and its own C-value target. |
| Sightlines | Risers are solved row by row to a target C-value (FIFA: 60, 90 or 120 mm), rounded to a riser step and capped at a maximum rake. A constant-riser mode is also available. Each seat's C-value is measured along its true plan sightline, so corners are checked obliquely. |
| Seats | Real seats are placed along every row. Radial aisles sit at each sector change and between sections, with at most 28 seats between aisles. Each seat has an id such as `T1-104-R12-S07`. |
| Capacity | Live gross capacity by tier and sector, plus "fit rows to target". Net capacity equals gross in R01 because no exclusions are modelled yet. |
| Analysis | Seats can be coloured by C-value, distance to the far corner (FIFA 150 m and 190 m), tier or sector. A seat inspector and "view from this seat" are included. |
| Views | Perspective, plan, elevation, section with a live cut plane, iso and field level. Explore, Technical (with dimensions) and Analysis modes. |
| Files | Save and open `.manicai.json`. Export to Rhino 8 or 7 `.3dm` with or without seats, a seat schedule `.csv`, and a join-tiers RhinoPython script. A MANICAI `.3dm` can be reopened in MANICAI. |

What is **not** in Round 01: vomitories, accessible and premium seat positions, concourses, structure, roof and façade. See [ROADMAP.md](docs/ROADMAP.md).

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # tests A–J (35 tests)
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
- [TESTS.md](docs/TESTS.md): acceptance tests A–J and benchmark results.

## Layout

```
src/core/          engine: sports, schema, plan, profiles, seats, stadium, optimize, presets, data
src/export/        Rhino .3dm writer and reader, CSV, browser download helpers, join script
src/viewport/      three.js / react-three-fiber scene
src/ui/            panels, toolbar, store (zustand)
tests/             vitest acceptance tests A–J
scripts/           bench, sample export, Python .3dm verifier, docs generator
examples/          every preset as a .manicai.json
samples/           Rhino 8 samples, seat schedule and a read-back manifest
```
