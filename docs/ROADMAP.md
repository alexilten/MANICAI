# Limitations and roadmap

## Known limitations after Round 05

- **Net capacity covers vomitories, wheelchair platforms and (optionally) poor sightlines.** Camera and media positions, kill-offs behind structure, and segregation gaps are not modelled yet.
- **Aisles and vomitories are geometric.** Radial aisles, lateral cross-aisles and vomitory openings are placed and counted, but there is no stair geometry inside aisles and no egress calculation: exit widths, travel distances and egress time still need a code analysis (`review.egress`).
- **Accessible positions** follow the US ADA 221.2.1.1 count (recall). Dispersion rules, sightlines over standing spectators and other jurisdictions' numbers are not checked.
- **One ring shape.** Stands can now sit at different distances, carry different row counts or be left open, but the plan is still a rounded rectangle (straight stands with circular corners). Oval or bowed stands and corner tiers that fold back are not modelled. Each tier keeps one rake all the way round.
- **The building is conceptual space planning.** Concourses, program zones and cores are set out from the bowl with allowances you set. There are no stair runs, escalators or ramps inside the cores, no toilet fixture counts, and no exit-capacity or travel-distance check (`review.egress`, `manicai.program`, `manicai.cores`).
- **Premium levels are full rings.** A suite or club level runs all the way round its tier (suites only on the chosen stands); loge boxes, field-level clubs and press boxes are not modelled yet.
- **Vomitories are not cut from the terrace solids in the .3dm.** They are separate closed solids; `manicai_join_tiers.py` joins each tier and subtracts them in Rhino.
- **Structure is coordination geometry.** Radial frames, rakers and columns are set out from the bowl, but member sizes, spans, cantilevers, transfer structure, bracing and vibration are not designed (`manicai.structure`, `review.structure`).
- **Roofs are parametric massing.** Seven typologies bear on the outer column line with simple tapering frames, a shallow dome or flat deck over the field and box trusses. There's no roof shading, sun or acoustic study, and coverage is plan projection (driven rain is not modelled). The high-ball view target (20 m by default) is a MANICAI assumption, not a published rule (`manicai.roof`).
- **One facade line.** The facade follows the plan ring at one offset with one family and module all the way round; there's no bowed or leaning facade, no sculpted geometry, and portals sit at the stand (and corner) centres.
- **Back-of-house is a single band at event level** with MANICAI area placeholders. Real briefs come from the operator, league and broadcasters (`manicai.boh`).
- **Lighting is a count, not a design.** The lumen method gives a fixture count and power for an average illuminance with a generic fixture; uniformity, vertical illuminance toward the cameras, glare ratings and flicker need a point-by-point calculation with real photometry. The 25° and 70° checks are from recall of the FIFA guide (`fifa.lighting`, `manicai.lighting`).
- **MEP are space reservations.** Plant, yards, risers, rooms and duct zones come from MANICAI planning ratios (`manicai.mep`); there's no load calculation, equipment selection, routing, smoke-control or fire-protection design. The energy centre sits on one frontage at grade.
- **Boards and broadcast are placeholders.** Board sizes are not products and readability is not checked; the camera plan is a typical layout, not a broadcaster's. Press tribune seats are counted but stay in capacity.
- **Sightlines** use C-values to the nearest field line at field level, on the section and along each seat's plan sightline. There's no check for obstruction by the tier above.
- **Rhino terraces arrive uncapped in pieces** because rhino3dm cannot join or cap. Run `manicai_join_tiers.py` in Rhino to make closed polysurfaces.
- **Big `.3dm` files:** about 0.75 KB per seat.
- **Codes:** Green Guide values are UK. US (IBC/NFPA 101, ADA) and other jurisdictions are not encoded yet. Several rules are tagged **recall** and must be checked against current editions.
- **Precedent presets** are low-confidence studies fitted to published capacity, not the buildings.
- **Baseball** is disabled. It needs an asymmetric field and a non-ring bowl.

## Next priorities

| Round | Focus |
|---|---|
| ~~R02 · Bowl detail~~ | Done: independent stands and corners, open ends, per-stand rows, club tiers, cross-aisles, vomitories, wheelchair platforms with companions, net vs gross, capacity suggestions. Carried over: media and camera positions, egress scaffolding, upper-tier obstruction check, oval and bowed stands. |
| ~~R03 · Premium and circulation~~ | Done: premium levels (suites, club) inserted into the section, concourses at each tier's access level, program zones from per-spectator allowances, cores, building metrics and a section diagram. Carried over: loges, field-level clubs, press boxes, escalators and ramps. |
| ~~R04 · Stadium architecture~~ | Done: structural grid, rakers and columns, seven roof typologies with coverage and the high-ball view, facade families with portals and materials, back-of-house at event level, exterior view and x-ray, Rhino layers 08, 09, 10 and 16. Carried over: transfer structure and bracing zones, sun and shade, bowed facades. |
| ~~R05 · Technical infrastructure~~ | Done: field lighting by the lumen method on a roof catwalk or corner masts with aiming and glare-angle checks, video and ribbon boards coordinated with the roof, speakers and Wi-Fi, broadcast cameras, press tribune and compound, MEP risers, rooms, duct zones and an energy centre, service yard and field access, night preview and system isolation, Rhino layers 11–15 and 17. Carried over: point-by-point lighting, concourse and architectural lighting, DAS and security zones, smoke control. |
| **R06 · Professional interoperability** | IFC, Revit workflow, improved CAD geometry, quantity schedules, model verification, GLB and DWG/DXF. |
| **R07 · Optimization** | Multivariable optimisation, scenarios, sightline heat maps, circulation, environmental studies, quantities and carbon. |
| **R08 · Product refinement** | Performance, polish, preset library, sharing and documentation. Site and orientation tools. |
| **Later** | Arenas (MANICA's arena work), baseball, revenue modelling, acoustics. |
