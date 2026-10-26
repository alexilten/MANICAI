# MANICAI

**A generative stadium design engine.** You set a sport, a field and a handful of bowl rules. MANICAI generates a continuous seating bowl with every seat placed, sightlines solved row by row, and live capacity. It exports a native Rhino model that an architect can keep working in, an IFC 4 model for BIM tools, glTF, DXF drawings and quantity schedules.

> MANICAI is an independent experimental product. It is not an official product of MANICA Architecture and is not endorsed by MANICA or any studio named in this repository. Precedent presets are parametric studies built from public facts, not the architects' geometry.

![Generic soccer bowl, perspective](docs/screenshots/01-perspective.png)

## Status after Round 06

| Area | What works now |
|---|---|
| Sports | Soccer, built to IFAB Law 1 with FIFA 105 × 68 m defaults. NFL, built to Rule 1 (360 × 160 ft) with end zones, hash marks, numbers, goalposts and team areas. Baseball is shown but disabled. |
| Bowl | One continuous bowl. The first-row line is a rounded rectangle offset from the field with a corner radius from 0 (four separate stands). Each stand (N, S, E, W) can sit at its own distance, and each stand or corner can carry its own row count per tier or be left open (a horseshoe). |
| Tiers | One to three tiers, general or club. Each tier sets its rows, row depth, seat width, first-row elevation or gap above the tier below, overhang or setback, front barrier, C-value target, lateral cross-aisles, vomitories and wheelchair positions. |
| Sightlines | Risers are solved row by row to a target C-value (FIFA: 60, 90 or 120 mm), rounded to a riser step and capped at a maximum rake. A constant-riser mode is also available. Each seat's C-value is measured along its true plan sightline, so corners are checked obliquely. |
| Seats | Real seats are placed along every row. Radial aisles sit at each sector change and between sections, with at most 28 seats between aisles. Each seat has an id such as `T1-104-R12-S07`. |
| Building | Premium levels (suites or club) inserted under an upper tier lift and set it back, so the section and the upper tier's sightlines respond. Each tier gets a concourse at its access level (vomitory floor or back row) with concessions, toilets, retail, first aid and club lounges sized from per-spectator allowances. Stair and lift cores stand outside at a set spacing. Gross floor area, area per spectator and a live building section. |
| Structure | A structural grid set out from the bowl: radial frames at a set bay along the outer column line (parallel on the straights, radial in the corners) and lettered ring grid lines at the tier supports. A raker under every tier on every frame and columns down to the tier below or grade. Coordination geometry, not an engineered design. |
| Roof | Seven typologies: open air, partial canopy, perimeter canopy, fixed enclosed, translucent ETFE, long-span truss and retractable. Leading edge, clearance over the top row, pitch, structural depth, frame density and (retractable) how far the panels are open. The roof clears the bowl, levels and cores; it reports seat coverage, roof area and the back-row high-ball view over the centre spot (or the clear height under an enclosed roof). |
| Facade & envelope | A facade wrapping the building at a set offset beyond the cores, up to the roof or a parapet. Glazed, fins, screen or solid families on a module, with slab-edge bands, 4 or 8 entry portals with canopies, and material finishes. Envelope footprint, perimeter, facade area and module count. |
| Back of house | Event-level rooms along a service corridor under and behind the lower tier: the players' tunnel on the main stand with home and away locker rooms either side, officials, medical, press and broadcast, kitchens, storage, loading, waste, groundskeeping and event operations, sized from MANICAI allowances you can scale. |
| Field lighting | A fixture count from the lumen method for a target illuminance over the playing area and run-off, with a generic fixture you set (output, power, maintenance and utilisation factors). Fixtures hang from a catwalk under the roof's leading edge when the roof rings the field, or from four corner masts sized for the 25° angle from the centre spot. Every fixture is aimed at the field and checked against the 70° tilt limit. Connected load, an illuminance estimate, and a night preview. |
| Boards, AV / IT and broadcast | Video boards behind both end stands (cut to fit under the roof) or one centre-hung board from a fixed roof (checked against the clear height and the high-ball zone), LED ribbons on every upper-tier fascia, speaker clusters on the catwalk and a Wi-Fi count. A main camera gantry on the main stand at halfway, line and behind-goal cameras with the main camera's view drawn to the field, a press tribune whose seats are counted (not removed), and an outside-broadcast compound. |
| MEP & service | Space reservations from MANICAI planning ratios: duct, electrical and plumbing risers at every core, an air-handling room and an electrical and telecom room on every level beside them, duct zones under the concourse ceilings and a cable tray along the event-level corridor. An energy centre (central plant, switchgear, transformer and generator yards, water storage and fire pumps, telecom head end) and a truck court on the service frontage, an electrical demand estimate with transformer and generator counts, and a vehicle tunnel onto the field. |
| Capacity | Live net capacity (after vomitories, wheelchair platforms and optionally seats below the minimum C) and gross, by tier, sector, stand and class, with the ADA wheelchair count. "Fit rows to target" and "Suggest moves", which tries geometric changes and flags the rules each would break. |
| Analysis | Seats can be coloured by C-value, distance to the far corner (FIFA 150 m and 190 m), tier, sector or class (with excluded positions shown). A seat inspector and "view from this seat" are included. |
| Views | Perspective, plan, elevation, section with a live cut plane, iso, field level and an exterior view from the plaza. X-ray makes the roof and facade see-through. Explore, Technical (with dimensions, level datums, the structural grid and floodlight aiming) and Analysis modes. A Systems view isolates the building systems, and a Night view lights the field. |
| Files | Save and open `.manicai.json`. Export to Rhino 8 or 7 `.3dm` with or without seats (structural grid, rakers and columns as exact extrusions, roof deck, cap, frames and trusses, facade skin, mullions and portals, back-of-house rooms, floodlights as aimed blocks with aiming lines, catwalk or masts, video and ribbon boards, broadcast positions, MEP risers, rooms, duct zones, energy centre yards and the service yard as exact extrusions, floor plates, suites, program zones and cores, vomitory solids, wheelchair and companion positions, club seats and excluded positions on their own layers), a seat schedule `.csv` with class and status, and a RhinoPython script that joins each tier and cuts its vomitories. A MANICAI `.3dm` can be reopened in MANICAI. |
| Interoperability | One BIM element model behind every export, with each element marked as a generic parametric element, conceptual mass, space reservation or generic placeholder. **IFC 4** with project, site, building and storeys, typed seats and floodlights, vomitory openings voiding the terraces, property and quantity sets and stable GlobalIds (validated with IfcOpenShell). **glTF** (.glb) with instanced seats, a **plan and section DXF**, **quantity and element schedules** (CSV) and a 15-check **model check** with a report. See [INTEROP.md](docs/INTEROP.md) for the IFC mapping and Revit notes. |

What is **not** in yet: testing in Revit (the notes are untested), direct DWG, a point-by-point lighting calculation, engineered MEP, loges and press boxes, engineered structure, site and precinct, and any egress calculation. See [ROADMAP.md](docs/ROADMAP.md).

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

### Round 04 views

| Exterior from the plaza: ETFE roof, glazed facade, portal | Perimeter canopy with exposed radial frames |
|---|---|
| ![Exterior](docs/screenshots/16-exterior-etfe.png) | ![Perimeter canopy](docs/screenshots/17-perimeter-canopy.png) |
| **X-ray** through the ETFE roof and facade | **Structural grid** (Technical plan, roof hidden): frames, ring lines, back-of-house |
| ![X-ray](docs/screenshots/18-xray-etfe.png) | ![Grid](docs/screenshots/19-structure-grid-plan.png) |
| **Section** with rakers, columns, roof trusses and level datums | **Retractable roof** (panels open) |
| ![Section](docs/screenshots/20-architecture-section.png) | ![Retractable](docs/screenshots/21-retractable.png) |

### Round 05 views

| Night preview: floodlights on the perimeter roof catwalk | Systems isolated (NFL, corner masts, energy centre, risers) |
|---|---|
| ![Night](docs/screenshots/23-night-perimeter.png) | ![Systems](docs/screenshots/24-systems-isolated.png) |
| **Section** with the floodlight aiming lines, catwalk and boards | **MEP plan** (Technical): risers, plant rooms, energy centre, service yard |
| ![Aiming](docs/screenshots/25-lighting-aiming.png) | ![MEP plan](docs/screenshots/26-mep-plan.png) |
| **Corner masts** at night on the horseshoe | **Technical systems** panel and lighting controls |
| ![Masts](docs/screenshots/27-masts-night.png) | ![Systems panel](docs/screenshots/28-systems-panel.png) |

### Round 06 views

| Export menu: BIM & CAD, schedules and data | Model check in the right panel |
|---|---|
| ![Export menu](docs/screenshots/29-export-menu.png) | ![Model check](docs/screenshots/30-model-check.png) |

## Run it

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # acceptance tests A–AO (102 tests)
npm run bench        # regeneration benchmarks at 25k, 50k, 75k and 100k seats
npm run build        # typecheck and production build
npm run export:samples && npm run verify:3dm   # needs: pip install rhino3dm
npm run verify:ifc && npm run verify:dxf       # needs: pip install ifcopenshell ezdxf
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
- [INTEROP.md](docs/INTEROP.md): the element model, IFC 4 mapping, Revit workflow notes, glTF, DXF and the model check.
- [TESTS.md](docs/TESTS.md): acceptance tests A–AO and benchmark results.

## Layout

```
src/core/          engine: sports, schema, plan, profiles, seats, stadium, optimize, presets, data
src/export/        element model, IFC 4, glTF, DXF, schedules, model check, Rhino .3dm writer and reader, CSV, downloads
src/viewport/      three.js / react-three-fiber scene
src/ui/            panels, toolbar, store (zustand)
tests/             vitest acceptance tests A–AO (v1–v4 fixtures in tests/fixtures)
scripts/           bench, sample export, Python .3dm, IFC and DXF verifiers, docs generator
examples/          every preset as a .manicai.json
samples/           Rhino 8, IFC, GLB and DXF samples, schedules, model check and a read-back manifest
```
